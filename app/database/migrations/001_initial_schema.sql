-- 001_initial_schema.sql
-- Initial Milestone 0 schema for Telegram Knowledge Engine (local-first, text-only).
-- All timestamps are stored as ISO-8601 UTC strings (e.g., 2026-03-01T12:00:00+00:00).

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    title TEXT,
    type TEXT,
    username TEXT,
    last_message_id INTEGER,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    sender_id INTEGER,
    date TEXT NOT NULL,
    edit_date TEXT,
    text TEXT,
    reply_to_message_id INTEGER,
    grouped_id INTEGER,
    has_media INTEGER NOT NULL DEFAULT 0 CHECK (has_media IN (0, 1)),
    is_important INTEGER NOT NULL DEFAULT 0 CHECK (is_important IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (chat_id, message_id),
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_date
    ON messages (chat_id, date DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id
    ON messages (sender_id);

CREATE TABLE IF NOT EXISTS sync_state (
    chat_id INTEGER PRIMARY KEY,
    last_message_id INTEGER,
    last_history_checkpoint INTEGER,
    last_sync_at TEXT,
    status TEXT,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);
