"""Domain model representing a Telegram dialog/chat."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.exceptions import DomainValidationError
from app.domain import ensure_int_id, ensure_utc_datetime


@dataclass(slots=True)
class Chat:
    """Pure domain representation of an archived Telegram chat."""

    id: int
    title: str | None = None
    type: str | None = None
    username: str | None = None
    last_message_id: int | None = None
    last_synced_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.id = ensure_int_id(self.id, "id", positive_only=False)

        if self.title is not None and not isinstance(self.title, str):
            raise DomainValidationError("'title' must be a string or None.")

        if self.type is not None and not isinstance(self.type, str):
            raise DomainValidationError("'type' must be a string or None.")

        if self.username is not None and not isinstance(self.username, str):
            raise DomainValidationError("'username' must be a string or None.")

        if self.last_message_id is not None:
            self.last_message_id = ensure_int_id(
                self.last_message_id, "last_message_id", positive_only=True
            )

        if self.last_synced_at is not None:
            self.last_synced_at = ensure_utc_datetime(self.last_synced_at, "last_synced_at")

        if self.created_at is not None:
            self.created_at = ensure_utc_datetime(self.created_at, "created_at")

        if self.updated_at is not None:
            self.updated_at = ensure_utc_datetime(self.updated_at, "updated_at")
