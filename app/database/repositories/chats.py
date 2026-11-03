"""SQLite repository implementation for Telegram chats and users."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from app.core.exceptions import DomainValidationError
from app.database.sqlite import SQLiteDatabase
from app.domain.models.chat import Chat
from app.domain.models.user import User


def _format_dt(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat() if value is not None else None


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


class SQLiteChatRepository:
    """Persists and retrieves ``Chat`` and ``User`` domain objects in SQLite."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._db = database

    def upsert(self, chat: Chat) -> Chat:
        """Insert a new chat or update mutable metadata on conflict."""
        now = datetime.now(UTC)
        created_at = chat.created_at or now
        updated_at = chat.updated_at or now

        with self._db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO chats (
                    id,
                    title,
                    type,
                    username,
                    last_message_id,
                    last_synced_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    type = excluded.type,
                    username = excluded.username,
                    last_message_id = excluded.last_message_id,
                    last_synced_at = excluded.last_synced_at,
                    updated_at = excluded.updated_at
                """,
                (
                    chat.id,
                    chat.title,
                    chat.type,
                    chat.username,
                    chat.last_message_id,
                    _format_dt(chat.last_synced_at),
                    _format_dt(created_at),
                    _format_dt(updated_at),
                ),
            )
            row = conn.execute("SELECT * FROM chats WHERE id = ?", (chat.id,)).fetchone()

        assert row is not None
        return self._row_to_chat(row)

    def get_by_id(self, chat_id: int) -> Chat | None:
        """Fetch a single chat by ID, or None if not found."""
        with self._db.connection() as conn:
            row = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_chat(row)

    def list_all(self, *, limit: int = 100, offset: int = 0) -> list[Chat]:
        """Return chats ordered deterministically by ``id`` ascending."""
        if limit <= 0:
            raise DomainValidationError("'limit' must be greater than zero.")
        if offset < 0:
            raise DomainValidationError("'offset' must be zero or positive.")

        with self._db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM chats ORDER BY id ASC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [self._row_to_chat(row) for row in rows]

    def upsert_user(self, user: User) -> User:
        """Insert or update a Telegram sender/user record."""
        now = datetime.now(UTC)
        updated_at = user.updated_at or now

        with self._db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO users (id, first_name, last_name, username, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    first_name = excluded.first_name,
                    last_name = excluded.last_name,
                    username = excluded.username,
                    updated_at = excluded.updated_at
                """,
                (
                    user.id,
                    user.first_name,
                    user.last_name,
                    user.username,
                    _format_dt(updated_at),
                ),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone()

        assert row is not None
        return self._row_to_user(row)

    def get_user_by_id(self, user_id: int) -> User | None:
        """Fetch a Telegram user by ID, or None if absent."""
        with self._db.connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_user(row)

    @staticmethod
    def _row_to_chat(row: sqlite3.Row) -> Chat:
        return Chat(
            id=int(row["id"]),
            title=row["title"],
            type=row["type"],
            username=row["username"],
            last_message_id=int(row["last_message_id"])
            if row["last_message_id"] is not None
            else None,
            last_synced_at=_parse_dt(row["last_synced_at"]),
            created_at=_parse_dt(row["created_at"]),
            updated_at=_parse_dt(row["updated_at"]),
        )

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> User:
        return User(
            id=int(row["id"]),
            first_name=row["first_name"],
            last_name=row["last_name"],
            username=row["username"],
            updated_at=_parse_dt(row["updated_at"]),
        )
