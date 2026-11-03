"""Domain model representing a Telegram sender/user."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.exceptions import DomainValidationError
from app.domain import ensure_int_id, ensure_utc_datetime


@dataclass(slots=True)
class User:
    """Pure domain representation of a Telegram user or sender."""

    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.id = ensure_int_id(self.id, "id", positive_only=False)

        for field_name in ("first_name", "last_name", "username"):
            val = getattr(self, field_name)
            if val is not None and not isinstance(val, str):
                raise DomainValidationError(f"'{field_name}' must be a string or None.")

        if self.updated_at is not None:
            self.updated_at = ensure_utc_datetime(self.updated_at, "updated_at")
