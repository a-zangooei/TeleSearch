# Database Architecture & Schema Reference

## 1. Engine & Connection Configuration

Telegram Knowledge Engine uses Python's standard-library `sqlite3` module backed by a local file (`data/database/telegram_archive.db` by default).

Every connection opened by `SQLiteDatabase` configures:

- `PRAGMA foreign_keys = ON;` — Enforces referential integrity across `chats`, `users`, `messages`, and `sync_state`.
- `PRAGMA busy_timeout = 5000;` — Waits up to 5 seconds on transient write contention instead of failing immediately with `SQLITE_BUSY`.
- Manual transaction mode (`isolation_level=None`) paired with explicit `BEGIN IMMEDIATE`, `COMMIT`, `ROLLBACK`, and nested `SAVEPOINT` blocks via `SQLiteDatabase.transaction()`.

---

## 2. Initial Schema (`001_initial_schema.sql`)

### `schema_migrations`

Tracks applied SQL migration files so repeated startups are idempotent.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `version` | `TEXT` | `PRIMARY KEY` | Migration filename stem (e.g. `001_initial_schema`) |
| `applied_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp when migration completed |

### `chats`

Stores Telegram dialog metadata (private chats, groups, supergroups, channels).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY` | Telegram dialog/peer ID (supports negative channel/supergroup IDs) |
| `title` | `TEXT` | nullable | Chat or channel title |
| `type` | `TEXT` | nullable | Dialog classification (e.g. `private`, `group`, `supergroup`, `channel`) |
| `username` | `TEXT` | nullable | Public handle without `@`, if present |
| `last_message_id` | `INTEGER` | nullable | Highest known Telegram message ID in this chat |
| `last_synced_at` | `TEXT` | nullable | ISO-8601 UTC timestamp of most recent sync |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC record creation timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC record update timestamp |

### `users`

Stores sender metadata referenced by archived messages.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY` | Telegram user/sender ID |
| `first_name` | `TEXT` | nullable | User first name |
| `last_name` | `TEXT` | nullable | User last name |
| `username` | `TEXT` | nullable | Public username, if available |
| `updated_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC record update timestamp |

### `messages`

Stores text-only message archives. Because Telegram message IDs are scoped per dialog in channels and supergroups, `messages` uses a **composite primary key `(chat_id, message_id)`**.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `chat_id` | `INTEGER` | `NOT NULL`, `FK -> chats(id) ON DELETE CASCADE` | Owning Telegram chat ID |
| `message_id` | `INTEGER` | `NOT NULL` | Per-chat Telegram message ID (`> 0`) |
| `sender_id` | `INTEGER` | nullable, `FK -> users(id) ON DELETE SET NULL` | Sender ID when attributable to a user |
| `date` | `TEXT` | `NOT NULL` | Original message publication timestamp (ISO-8601 UTC) |
| `edit_date` | `TEXT` | nullable | Last edit timestamp in Telegram (ISO-8601 UTC) |
| `text` | `TEXT` | nullable | Verbatim original message text (unmodified) |
| `reply_to_message_id` | `INTEGER` | nullable | Target `message_id` within the same chat if a reply |
| `grouped_id` | `INTEGER` | nullable | Telegram album/grouped message correlation ID |
| `has_media` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (0, 1)` | `1` if original Telegram message had media attached |
| `is_important` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (0, 1)` | `1` if bookmarked/starred locally by the user |
| `created_at` | `TEXT` | `NOT NULL` | Local archive insertion timestamp (ISO-8601 UTC) |
| `updated_at` | `TEXT` | `NOT NULL` | Local archive update timestamp (ISO-8601 UTC) |

**Indexes on `messages`:**
- Primary key B-tree index on `(chat_id, message_id)`
- `idx_messages_chat_date` on `(chat_id, date DESC, message_id DESC)`
- `idx_messages_sender_id` on `(sender_id)`

*(Note: FTS5 virtual tables and search normalization columns are intentionally deferred to the Search Milestone.)*

### `sync_state`

Stores resumable per-chat synchronization checkpoints for future Telethon collectors.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `chat_id` | `INTEGER` | `PRIMARY KEY`, `FK -> chats(id) ON DELETE CASCADE` | Target Telegram chat ID |
| `last_message_id` | `INTEGER` | nullable | Highest synced Telegram message ID |
| `last_history_checkpoint` | `INTEGER` | nullable | Backfill pagination offset message ID |
| `last_sync_at` | `TEXT` | nullable | ISO-8601 UTC timestamp of last checkpoint |
| `status` | `TEXT` | nullable | Sync status label (e.g. `idle`, `backfilling`, `error`) |

---

## 3. Timestamp & Parameterization Conventions

- **UTC Everywhere:** Domain models require timezone-aware `datetime` instances and normalize them to `datetime.UTC`. SQLite columns store timestamps as ISO-8601 UTC strings via `.isoformat()` (e.g. `2026-03-15T12:00:00+00:00`) and parse them back via `datetime.fromisoformat()`.
- **Parameterized Queries Only:** All repository queries bind values with `?` placeholders. Dynamic string interpolation of user or message data into SQL is strictly prohibited.

---

## 4. Migration Strategy

1. Numbered `.sql` files live in `app/database/migrations/` (e.g. `001_initial_schema.sql`, `002_...`).
2. `SQLiteDatabase.initialize()` discovers `*.sql` files sorted lexicographically and checks `schema_migrations`.
3. Statements in each unapplied migration file are parsed via `sqlite3.complete_statement()` (avoiding `executescript()`'s implicit commits) and executed inside an explicit `BEGIN IMMEDIATE ... COMMIT` transaction alongside the `INSERT INTO schema_migrations` record.
4. Any error during a migration triggers a full transactional `ROLLBACK` (including DDL statements), leaving the database clean and consistent.

---

## 5. Planned Backup Strategy (Future Milestone)

Future milestones will implement hot, consistent local backups into `data/backups/` using SQLite's native online backup API exposed by Python's standard library (`sqlite3.Connection.backup(target_conn)`), avoiding unsafe raw file copies while transactions are active.
