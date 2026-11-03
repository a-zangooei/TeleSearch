"""Shared pytest fixtures using isolated temporary SQLite databases."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.database.repositories.chats import SQLiteChatRepository
from app.database.repositories.messages import SQLiteMessageRepository
from app.database.sqlite import SQLiteDatabase


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    """Return a clean temporary SQLite file path per test."""
    return tmp_path / "database" / "test_archive.db"


@pytest.fixture
def sqlite_db(temp_db_path: Path) -> SQLiteDatabase:
    """Return an initialized SQLiteDatabase backed by a temporary file."""
    db = SQLiteDatabase(temp_db_path)
    db.initialize()
    return db


@pytest.fixture
def chat_repo(sqlite_db: SQLiteDatabase) -> SQLiteChatRepository:
    """Return a SQLiteChatRepository bound to the temporary database."""
    return SQLiteChatRepository(sqlite_db)


@pytest.fixture
def message_repo(sqlite_db: SQLiteDatabase) -> SQLiteMessageRepository:
    """Return a SQLiteMessageRepository bound to the temporary database."""
    return SQLiteMessageRepository(sqlite_db)
