"""Storage adapter protocols decoupling domain and services from SQLite."""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Any, Protocol, runtime_checkable

from app.domain.models.chat import Chat
from app.domain.models.message import Message
from app.domain.models.user import User


@runtime_checkable
class DatabaseEngine(Protocol):
    """Engine-agnostic lifecycle and transaction boundary interface."""

    def initialize(self) -> list[str]:
        """Initialize storage and apply any pending schema migrations.

        Returns the list of newly applied migration version identifiers.
        """
        ...

    def transaction(self) -> AbstractContextManager[Any]:
        """Return a context manager providing an atomic write transaction."""
        ...

    def health_check(self) -> dict[str, Any]:
        """Verify database connectivity, pragmas, and schema readiness."""
        ...


@runtime_checkable
class ChatRepository(Protocol):
    """Repository contract for Telegram chat and sender metadata."""

    def upsert(self, chat: Chat) -> Chat:
        """Insert or update a chat record and return the persisted domain object."""
        ...

    def get_by_id(self, chat_id: int) -> Chat | None:
        """Retrieve a chat by its Telegram dialog ID, or None if absent."""
        ...

    def list_all(self, *, limit: int = 100, offset: int = 0) -> list[Chat]:
        """List stored chats ordered deterministically by ID."""
        ...

    def upsert_user(self, user: User) -> User:
        """Insert or update a Telegram user/sender record."""
        ...

    def get_user_by_id(self, user_id: int) -> User | None:
        """Retrieve a Telegram user/sender by ID, or None if absent."""
        ...


@runtime_checkable
class MessageRepository(Protocol):
    """Repository contract for archived text-only Telegram messages."""

    def upsert(self, message: Message) -> Message:
        """Insert or update a message keyed by (chat_id, message_id) without duplicates."""
        ...

    def get_by_key(self, chat_id: int, message_id: int) -> Message | None:
        """Retrieve a single message by its composite key (chat_id, message_id)."""
        ...

    def list_by_chat(
        self,
        chat_id: int,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Message]:
        """List messages belonging to a chat with deterministic pagination."""
        ...

    def count_by_chat(self, chat_id: int) -> int:
        """Return total stored message count for a given chat."""
        ...
