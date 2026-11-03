"""Domain layer primitives and shared validation helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.exceptions import DomainValidationError


def ensure_int_id(value: object, field_name: str, *, positive_only: bool = False) -> int:
    """Validate that an identifier is an integer (not bool) and meets sign rules."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise DomainValidationError(f"'{field_name}' must be an integer.")
    if positive_only and value <= 0:
        raise DomainValidationError(f"'{field_name}' must be a positive integer (> 0).")
    if not positive_only and value == 0:
        raise DomainValidationError(f"'{field_name}' must be a non-zero integer.")
    return value


def ensure_utc_datetime(value: object, field_name: str) -> datetime:
    """Validate a timezone-aware datetime and normalize it to UTC."""
    if not isinstance(value, datetime):
        raise DomainValidationError(f"'{field_name}' must be a datetime instance.")
    if value.tzinfo is None or value.utcoffset() is None:
        raise DomainValidationError(
            f"'{field_name}' must be a timezone-aware datetime (UTC required internally)."
        )
    return value.astimezone(UTC)
