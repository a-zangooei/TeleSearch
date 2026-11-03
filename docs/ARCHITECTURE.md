# Architecture Overview

## 1. Local-First Design Philosophy

Telegram Knowledge Engine (TKE) is architected as a **local-first** application:

1. **Primary Source of Truth:** A local SQLite database (`data/database/telegram_archive.db`) owns all archived dialogs, senders, messages, and synchronization checkpoints on the user's machine.
2. **Offline Availability:** Configuration loading, schema migrations, health verification, repository reads/writes, and automated tests operate 100% offline with zero network calls or external service dependencies.
3. **Zero Credential Coupling at Startup:** Missing `TG_API_ID` or `TG_API_HASH` never prevents local database initialization, health checks, or archive inspection. Credentials are validated lazily via `AppConfig.require_telegram_credentials()` only when a Telegram collector component is explicitly invoked in future milestones.

---

## 2. Layered Module Boundaries

```text
app/
├── core/        # Cross-cutting infrastructure: AppConfig, UTC logging + redaction, TKEError hierarchy
├── domain/      # Pure Python dataclasses (Chat, User, Message) & invariant validators
├── database/    # Storage protocols (base.py), SQLite engine/migrations (sqlite.py), repositories
└── main.py      # Minimal composition root & offline initialization entrypoint
```

### Domain vs. Database Separation

- **Pure Domain Layer (`app/domain/models/`):**
  - Implemented strictly with standard-library `@dataclass(slots=True)` and `datetime`.
  - Contains **no imports** from `sqlite3`, `telethon`, `fastapi`, or `pydantic`.
  - Enforces structural invariants at construction time: valid integer identifiers, timezone-aware UTC `datetime` normalization, and **verbatim preservation** of `Message.text` (never mutating whitespace, Persian half-spaces `\u200c`, or Arabic/Persian characters in the raw `text` field).
- **Storage Protocols (`app/database/base.py`):**
  - Defines `DatabaseEngine`, `ChatRepository`, and `MessageRepository` using `typing.Protocol`.
  - Higher-level services depend on these protocols rather than concrete `sqlite3` cursors or SQL strings.
- **SQLite Adapter (`app/database/sqlite.py` & `app/database/repositories/`):**
  - Encapsulates connection management, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout`, explicit `BEGIN IMMEDIATE` transactions with nested `SAVEPOINT` support, and parameterized `INSERT ... ON CONFLICT` upserts.

---

## 3. Future Extension Boundaries

### Future Telethon Collector Boundary (Milestone 1+)

When Telegram ingestion is added in a later milestone, Telethon-specific code will live inside an isolated `app/telegram/` adapter package:

- Telethon TL objects (`telethon.tl.types.Message`, `Dialog`, `User`, `Channel`) must never leak outside `app/telegram/`.
- An anti-corruption mapper will convert Telethon objects into pure `app.domain.models.Chat`, `User`, and `Message` instances before passing them to `ChatRepository` and `MessageRepository`.
- Per-chat progress will be persisted through `sync_state` (`last_message_id`, `last_history_checkpoint`, `last_sync_at`, `status`) so interrupted history imports resume cleanly without re-fetching or duplicating messages.

### Future Cloud & Self-Hosted Storage Adapters

Because domain models and repository contracts in `app/database/base.py` have zero coupling to `sqlite3` or any vendor SDK:

- SQLite remains the mandatory local primary store.
- Optional future Cloud Sync adapters (e.g., Cloudflare Workers + D1, self-hosted PostgreSQL/HTTP APIs, or encrypted object snapshots) can be implemented as independent outbound sync adapters reading committed domain records from local repositories without rewriting domain logic or local repositories.

---

## 4. Permanent Exclusion of Media Processing

TKE is strictly a **text knowledge engine**, not a media downloader or backup mirror:

- Downloading photos, videos, voice messages, audio files, stickers, archives, or PDFs dramatically bloats local storage, complicates rate-limiting/flood-wait handling with Telegram servers, and shifts architectural focus away from fast text indexing and knowledge retrieval.
- Only a lightweight boolean flag (`Message.has_media: bool`) is stored so users know whether an archived message originally accompanied an attachment in Telegram, without ever fetching, storing, or serving binary media payloads.
