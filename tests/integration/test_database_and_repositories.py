"""Integration tests for SQLite migrations, repositories, pagination, and transactions."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.exceptions import DatabaseError, MigrationError
from app.database.base import ChatRepository, DatabaseEngine, MessageRepository
from app.database.repositories.chats import SQLiteChatRepository
from app.database.repositories.messages import SQLiteMessageRepository
from app.database.sqlite import SQLiteDatabase
from app.domain.models import Chat, Message, User


def test_protocols_are_satisfied(
    sqlite_db: SQLiteDatabase,
    chat_repo: SQLiteChatRepository,
    message_repo: SQLiteMessageRepository,
) -> None:
    assert isinstance(sqlite_db, DatabaseEngine)
    assert isinstance(chat_repo, ChatRepository)
    assert isinstance(message_repo, MessageRepository)


def test_initial_migration_and_idempotent_repeated_startup(temp_db_path: Path) -> None:
    db = SQLiteDatabase(temp_db_path)
    first_applied = db.initialize()
    assert first_applied == ["001_initial_schema"]

    health = db.health_check()
    assert health["healthy"] is True
    assert health["foreign_keys_enabled"] is True
    assert set(health["tables"]) == {
        "chats",
        "messages",
        "schema_migrations",
        "sync_state",
        "users",
    }

    # Insert data and verify repeated startup neither re-applies migrations nor loses data
    chats = SQLiteChatRepository(db)
    chats.upsert(Chat(id=-1001, title="Engineering Notes", type="channel"))

    second_db = SQLiteDatabase(temp_db_path)
    second_applied = second_db.initialize()
    assert second_applied == []
    assert second_db.list_applied_migrations() == ["001_initial_schema"]

    persisted_chat = SQLiteChatRepository(second_db).get_by_id(-1001)
    assert persisted_chat is not None
    assert persisted_chat.title == "Engineering Notes"


def test_failed_migration_rolls_back_atomically(tmp_path: Path) -> None:
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "001_broken.sql").write_text(
        """
        CREATE TABLE partial_table (id INTEGER PRIMARY KEY);
        INVALID SQL STATEMENT THAT FAILS;
        """,
        encoding="utf-8",
    )

    db = SQLiteDatabase(tmp_path / "broken.db", migrations_dir=migrations_dir)
    with pytest.raises(MigrationError):
        db.initialize()

    with db.connection() as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'"
        ).fetchone()
    assert row is None
    assert db.list_applied_migrations() == []


def test_chat_and_user_upsert_and_retrieval(chat_repo: SQLiteChatRepository) -> None:
    synced_time = datetime(2026, 3, 10, 9, 30, tzinfo=UTC)
    created = chat_repo.upsert(
        Chat(
            id=-1009988,
            title="Python Architecture",
            type="supergroup",
            username="py_arch",
            last_message_id=150,
            last_synced_at=synced_time,
        )
    )
    assert created.title == "Python Architecture"
    assert created.created_at is not None

    # Update chat title & last_message_id without losing created_at
    updated = chat_repo.upsert(
        Chat(
            id=-1009988,
            title="Python Architecture & SQLite",
            type="supergroup",
            username="py_arch",
            last_message_id=175,
            last_synced_at=synced_time,
        )
    )
    assert updated.title == "Python Architecture & SQLite"
    assert updated.last_message_id == 175
    assert updated.created_at == created.created_at

    user = chat_repo.upsert_user(
        User(id=4242, first_name="سارا", last_name="احمدی", username="sara_dev")
    )
    fetched_user = chat_repo.get_user_by_id(4242)
    assert fetched_user is not None
    assert fetched_user.first_name == "سارا"
    assert fetched_user.username == user.username


def test_message_composite_key_upsert_without_duplicates(
    chat_repo: SQLiteChatRepository,
    message_repo: SQLiteMessageRepository,
) -> None:
    chat_repo.upsert(Chat(id=-10010, title="Channel A", type="channel"))
    chat_repo.upsert(Chat(id=-10020, title="Channel B", type="channel"))
    chat_repo.upsert_user(User(id=501, first_name="Ali"))

    base_date = datetime(2026, 3, 20, 14, 0, tzinfo=UTC)
    original_text = "پیام اول با نیم\u200cفاصله و بدون هیچ تغییر"

    # Insert message_id=10 in Channel A and message_id=10 in Channel B (composite PK check)
    msg_a = message_repo.upsert(
        Message(
            chat_id=-10010,
            message_id=10,
            sender_id=501,
            date=base_date,
            text=original_text,
        )
    )
    msg_b = message_repo.upsert(
        Message(
            chat_id=-10020,
            message_id=10,
            sender_id=501,
            date=base_date,
            text="Same message_id in different chat",
        )
    )
    assert msg_a.text == original_text
    assert msg_b.text == "Same message_id in different chat"

    # Update message (-10010, 10) via upsert and ensure no duplicate row is created
    edit_dt = datetime(2026, 3, 20, 15, 0, tzinfo=UTC)
    edited = message_repo.upsert(
        Message(
            chat_id=-10010,
            message_id=10,
            sender_id=501,
            date=base_date,
            edit_date=edit_dt,
            text="نسخه ویرایش شده پیام",
            is_important=True,
        )
    )

    assert message_repo.count_by_chat(-10010) == 1
    fetched = message_repo.get_by_key(-10010, 10)
    assert fetched is not None
    assert fetched.text == "نسخه ویرایش شده پیام"
    assert fetched.edit_date == edit_dt
    assert fetched.is_important is True
    assert fetched.created_at == msg_a.created_at
    assert edited.created_at == msg_a.created_at


def test_message_pagination_limit_and_offset(
    chat_repo: SQLiteChatRepository,
    message_repo: SQLiteMessageRepository,
) -> None:
    chat_id = -100777
    chat_repo.upsert(Chat(id=chat_id, title="Pagination Chat", type="group"))

    base_dt = datetime(2026, 3, 25, 10, 0, tzinfo=UTC)
    for idx in range(1, 8):
        message_repo.upsert(
            Message(
                chat_id=chat_id,
                message_id=idx,
                date=base_dt,
                text=f"Message #{idx}",
            )
        )

    assert message_repo.count_by_chat(chat_id) == 7

    first_page = message_repo.list_by_chat(chat_id, limit=3, offset=0)
    second_page = message_repo.list_by_chat(chat_id, limit=3, offset=3)
    third_page = message_repo.list_by_chat(chat_id, limit=3, offset=6)

    assert [m.message_id for m in first_page] == [1, 2, 3]
    assert [m.message_id for m in second_page] == [4, 5, 6]
    assert [m.message_id for m in third_page] == [7]


def test_transaction_rollback_and_foreign_key_enforcement(
    sqlite_db: SQLiteDatabase,
    chat_repo: SQLiteChatRepository,
    message_repo: SQLiteMessageRepository,
) -> None:
    now = datetime(2026, 3, 28, 12, 0, tzinfo=UTC)

    # 1. Foreign key check: inserting message for non-existent chat must fail
    with pytest.raises(DatabaseError, match="FOREIGN KEY constraint failed"):
        message_repo.upsert(Message(chat_id=-999999, message_id=1, date=now, text="Orphan"))

    # 2. Multi-step transaction rollback on error must leave zero partial writes
    with pytest.raises(RuntimeError, match="simulated failure"), sqlite_db.transaction():
        chat_repo.upsert(Chat(id=-100555, title="Rollback Chat", type="group"))
        message_repo.upsert(
            Message(chat_id=-100555, message_id=1, date=now, text="Should roll back")
        )
        raise RuntimeError("simulated failure")

    assert chat_repo.get_by_id(-100555) is None
    assert message_repo.get_by_key(-100555, 1) is None
