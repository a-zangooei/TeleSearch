"""Domain model representing an archived text-only Telegram message."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.exceptions import DomainValidationError
from app.domain import ensure_int_id, ensure_utc_datetime


@dataclass(slots=True)
class Message:
    """Pure domain representation of an archived Telegram message.

    Original ``text`` is preserved verbatim without stripping, Unicode mutation,
    or half-space alteration. No media payloads or paths are stored.
    """

    chat_id: int
    message_id: int
    date: datetime
    sender_id: int | None = None
    edit_date: datetime | None = None
    text: str | None = None
    reply_to_message_id: int | None = None
    grouped_id: int | None = None
    has_media: bool = False
    is_important: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.chat_id = ensure_int_id(self.chat_id, "chat_id", positive_only=False)
        self.message_id = ensure_int_id(self.message_id, "message_id", positive_only=True)
        self.date = ensure_utc_datetime(self.date, "date")

        if self.sender_id is not None:
            self.sender_id = ensure_int_id(self.sender_id, "sender_id", positive_only=False)

        if self.edit_date is not None:
            self.edit_date = ensure_utc_datetime(self.edit_date, "edit_date")

        if self.text is not None and not isinstance(self.text, str):
            raise DomainValidationError("'text' must be a string or None.")

        if self.reply_to_message_id is not None:
            self.reply_to_message_id = ensure_int_id(
                self.reply_to_message_id, "reply_to_message_id", positive_only=True
            )

        if self.grouped_id is not None:
            self.grouped_id = ensure_int_id(self.grouped_id, "grouped_id", positive_only=False)

        if not isinstance(self.has_media, bool):
            raise DomainValidationError("'has_media' must be a boolean.")

        if not isinstance(self.is_important, bool):
            raise DomainValidationError("'is_important' must be a boolean.")

        if self.created_at is not None:
            self.created_at = ensure_utc_datetime(self.created_at, "created_at")

        if self.updated_at is not None:
            self.updated_at = ensure_utc_datetime(self.updated_at, "updated_at")
