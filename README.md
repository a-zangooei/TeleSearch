# Telegram Knowledge Engine (TKE)

**Telegram Knowledge Engine** is a local-first, text-only personal archive and search engine for Telegram messages.

> **Core Product Invariant:** TKE archives and indexes **text, metadata, sender/dialog context, reply chains, and timestamps only**. It never downloads, uploads, caches, or processes photos, videos, audio, voice notes, documents, PDFs, or binary media attachments.

---

## Milestone 0 — Project Foundation Scope

This repository currently implements **Milestone 0 (Project Foundation)**:

- Clean, modular Python package layout (`app/core`, `app/domain`, `app/database`, `app/main.py`)
- Centralized, credential-safe configuration (`AppConfig`, `.env` + environment variable loading)
- Structured UTC console and file logging (`data/logs/tke.log`) with automatic secret redaction
- Pure, framework-independent domain models (`Message`, `Chat`, `User`) preserving original message text verbatim
- Local SQLite storage engine (`sqlite3`) with `PRAGMA foreign_keys = ON`, atomic transactions/savepoints, and idempotent SQL migrations (`001_initial_schema.sql`)
- Repository abstractions (`Protocol`) and concrete SQLite repositories (`SQLiteChatRepository`, `SQLiteMessageRepository`)
- Automated unit and integration test suite (`pytest`) and static analysis/formatting (`ruff`)

### Out of Scope in Milestone 0

Telegram authentication, Telethon history sync, live event handlers, FTS5 full-text search, FastAPI HTTP endpoints, Cloud Sync adapters, and optional AI features are intentionally deferred to subsequent milestones.

---

## Supported Python Versions & Platforms

- **Primary Target:** Python **3.13** (`.python-version`)
- **Compatibility Verified:** Python **3.14**
- **Supported OS:** Linux and Windows

---

## Installation

### Option A — Using `uv` (Recommended)

**Linux / macOS:**

```bash
uv python install 3.13
uv sync --dev
```

**Windows (PowerShell):**

```powershell
uv python install 3.13
uv sync --dev
```

### Option B — Using Standard `venv` and `pip`

**Linux / macOS:**

```bash
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

**Windows (PowerShell):**

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

---

## Configuration

Copy `.env.example` to `.env` for local customization:

```bash
# Linux / macOS
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Available settings:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_ENV` | `development` | Execution environment (`development`, `testing`, `production`) |
| `APP_LOG_LEVEL` | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`) |
| `DATABASE_PATH` | `data/database/telegram_archive.db` | Path to local SQLite database file |
| `TG_API_ID` | *(empty)* | Optional in Milestone 0; required in future Telethon milestones |
| `TG_API_HASH` | *(empty)* | Optional in Milestone 0; never logged or committed |
| `TG_SESSION_PATH` | `data/telegram_session` | Local Telethon session path for future milestones |

**Security note:** Never commit `.env`, `*.session` files, or `data/database/*.db` files to version control.

---

## Running Milestone 0 Entrypoint

Initialize the local SQLite database, apply pending migrations, and run an offline health check:

```bash
# With uv
uv run python -m app.main

# With activated venv
python -m app.main
```

---

## Running Tests & Linting

```bash
# Run automated unit + integration test suite
uv run pytest -v

# Run Ruff linter and format verification
uv run ruff check .
uv run ruff format --check .
```

---

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Database Schema & Migrations](docs/DATABASE.md)
- [Development Guide](docs/DEVELOPMENT.md)
