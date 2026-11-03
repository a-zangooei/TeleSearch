"""Unit tests for pure domain models (Message, Chat, User)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.core.exceptions import DomainValidationError
from app.domain.models import Chat, Message, User


def test_message_preserves_original_text_verbatim_and_normalizes_utc() -> None:
    tehran_tz = timezone(timedelta(hours=3, minutes=30))
    sent_local = datetime(2026, 3, 15, 15, 30, 0, tzinfo=tehran_tz)

    verbatim_text = "  سلام\u200cدنیا! ي ك\nLine 2 with   spaces & `code`  "
    msg = Message(
        chat_id=-100192837465,
        message_id=4201,
        sender_id=556677,
        date=sent_local,
        text=verbatim_text,
        reply_to_message_id=4199,
        grouped_id=99887766,
        has_media=True,
        is_important=True,
    )

    assert msg.text == verbatim_text
    assert msg.date == datetime(2026, 3, 15, 12, 0, 0, tzinfo=UTC)
    assert msg.date.tzinfo == UTC
    assert msg.edit_date is None
    assert msg.created_at is None
    assert msg.updated_at is None
    assert msg.has_media is True
    assert msg.is_important is True


def test_models_support_optional_fields() -> None:
    now = datetime(2026, 1, 10, 8, 0, tzinfo=UTC)
    chat = Chat(id=-100500)
    user = User(id=777000)
    msg = Message(chat_id=chat.id, message_id=1, date=now)

    assert chat.title is None
    assert chat.last_message_id is None
    assert user.first_name is None
    assert user.username is None
    assert msg.sender_id is None
    assert msg.text is None
    assert msg.has_media is False
    assert msg.is_important is False


def test_naive_datetime_is_rejected_across_models() -> None:
    naive_dt = datetime(2026, 3, 1, 12, 0, 0)

    with pytest.raises(DomainValidationError, match="timezone-aware"):
        Message(chat_id=1, message_id=1, date=naive_dt)

    with pytest.raises(DomainValidationError, match="timezone-aware"):
        Chat(id=1, last_synced_at=naive_dt)

    with pytest.raises(DomainValidationError, match="timezone-aware"):
        User(id=1, updated_at=naive_dt)


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        ({"chat_id": 0, "message_id": 1}, "'chat_id' must be a non-zero integer"),
        ({"chat_id": True, "message_id": 1}, "'chat_id' must be an integer"),
        ({"chat_id": 100, "message_id": 0}, "'message_id' must be a positive integer"),
        ({"chat_id": 100, "message_id": -7}, "'message_id' must be a positive integer"),
        (
            {"chat_id": 100, "message_id": 1, "reply_to_message_id": 0},
            "'reply_to_message_id' must be a positive integer",
        ),
    ],
)
def test_message_rejects_invalid_identifiers(kwargs: dict[str, object], match: str) -> None:
    now = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)
    with pytest.raises(DomainValidationError, match=match):
        Message(date=now, **kwargs)  # type: ignore[arg-type]
