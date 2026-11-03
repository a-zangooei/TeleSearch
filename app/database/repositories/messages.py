"""SQLite repository implementation for archived text-only Telegram messages."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from app.core.exceptions import DomainValidationError
from app.database.sqlite import SQLiteDatabase
from app.domain.models.message import Message


def _format_dt(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat() if value is not None else None


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


class SQLiteMessageRepository:
    """Persists and retrieves ``Message`` domain objects keyed by ``(chat_id, message_id)``."""

    def __init__(self, database: SQLiteDatabase) -> None:
        self._db = database

    def upsert(self, message: Message) -> Message:
        """Insert or update a message without duplicating ``(chat_id, message_id)``.

        Preserves ``created_at`` across updates and stores ``text`` verbatim.
        """
        now = datetime.now(UTC)
        created_at = message.created_at or now
        updated_at = message.updated_at or now

        with self._db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO messages (
                    chat_id,
                    message_id,
                    sender_id,
                    date,
                    edit_date,
                    text,
                    reply_to_message_id,
                    grouped_id,
                    has_media,
                    is_important,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chat_id, message_id) DO UPDATE SET
                    sender_id = excluded.sender_id,
                    date = excluded.date,
                    edit_date = excluded.edit_date,
                    text = excluded.text,
                    reply_to_message_id = excluded.reply_to_message_id,
                    grouped_id = excluded.grouped_id,
                    has_media = excluded.has_media,
                    is_important = excluded.is_important,
                    updated_at = excluded.updated_at
                """,
                (
                    message.chat_id,
                    message.message_id,
                    message.sender_id,
                    _format_dt(message.date),
                    _format_dt(message.edit_date),
                    message.text,
                    message.reply_to_message_id,
                    message.grouped_id,
                    1 if message.has_media else 0,
                    1 if message.is_important else 0,
                    _format_dt(created_at),
                    _format_dt(updated_at),
                ),
            )
            row = conn.execute(
                "SELECT * FROM messages WHERE chat_id = ? AND message_id = ?",
                (message.chat_id, message.message_id),
            ).fetchone()

        assert row is not None
        return self._row_to_message(row)

    def get_by_key(self, chat_id: int, message_id: int) -> Message | None:
        """Retrieve a message by ``(chat_id, message_id)``, or None if not found."""
        with self._db.connection() as conn:
            row = conn.execute(
                "SELECT * FROM messages WHERE chat_id = ? AND message_id = ?",
                (chat_id, message_id),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_message(row)

    def list_by_chat(
        self,
        chat_id: int,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Message]:
        """List messages for a chat ordered by ``message_id ASC`` with pagination."""
        if limit <= 0:
            raise DomainValidationError("'limit' must be greater than zero.")
        if offset < 0:
            raise DomainValidationError("'offset' must be zero or positive.")

        with self._db.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM messages
                WHERE chat_id = ?
                ORDER BY message_id ASC
                LIMIT ? OFFSET ?
                """,
                (chat_id, limit, offset),
            ).fetchall()
        return [self._row_to_message(row) for row in rows]

    def count_by_chat(self, chat_id: int) -> int:
        """Return total number of stored messages for ``chat_id``."""
        with self._db.connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ?",
                (chat_id,),
            ).fetchone()
        return int(row["cnt"]) if row is not None else 0

    @staticmethod
    def _row_to_message(row: sqlite3.Row) -> Message:
        date_val = _parse_dt(row["date"])
        assert date_val is not None
        return Message(
            chat_id=int(row["chat_id"]),
            message_id=int(row["message_id"]),
            sender_id=int(row["sender_id"]) if row["sender_id"] is not None else None,
            date=date_val,
            edit_date=_parse_dt(row["edit_date"]),
            text=row["text"],
            reply_to_message_id=int(row["reply_to_message_id"])
            if row["reply_to_message_id"] is not None
            else None,
            grouped_id=int(row["grouped_id"]) if row["grouped_id"] is not None else None,
            has_media=bool(row["has_media"]),
            is_important=bool(row["is_important"]),
            created_at=_parse_dt(row["created_at"]),
            updated_at=_parse_dt(row["updated_at"]),
        )
