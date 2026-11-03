# Development Guide

## 1. Prerequisites

- **Python 3.13** (primary target; `.python-version` is pinned to `3.13`)
- Compatible with **Python 3.14**
- Supported operating systems: **Linux** and **Windows**
- Recommended package/environment manager: [`uv`](https://docs.astral.sh/uv/) (standard `venv` + `pip` is also fully supported)

---

## 2. Environment Setup

### Linux / macOS

**Using `uv`:**

```bash
uv python install 3.13
uv sync --dev
cp .env.example .env
```

**Using `venv` + `pip`:**

```bash
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
cp .env.example .env
```

### Windows (PowerShell)

**Using `uv`:**

```powershell
uv python install 3.13
uv sync --dev
Copy-Item .env.example .env
```

**Using `venv` + `pip`:**

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e ".[dev]"
Copy-Item .env.example .env
```

---

## 3. Running Tests

Tests are organized into:

- `tests/unit/` — Fast, isolated tests for `AppConfig`, `SensitiveDataFilter` logging, and domain models (`Message`, `Chat`, `User`).
- `tests/integration/` — Temporary-filesystem SQLite tests verifying migrations, idempotent startup, composite-key `(chat_id, message_id)` upserts, pagination, foreign key constraints, transactional rollbacks, and `app.main`.

Run the full test suite:

```bash
# Using uv
uv run pytest -v

# Test against a specific Python version (e.g., 3.13 or 3.14)
uv run --python 3.13 pytest -v
uv run --python 3.14 pytest -v

# Using activated venv
pytest -v
```

All tests create isolated databases inside pytest's `tmp_path` fixture and never touch `data/database/telegram_archive.db`.

---

## 4. Linting & Formatting (`Ruff`)

Ruff enforces PEP 8, import sorting (`I`), bugbear (`B`), pyupgrade (`UP`), and simplification (`SIM`) rules targeting Python 3.13 (`line-length = 100`).

```bash
# Check lint rules
uv run ruff check .

# Check code formatting
uv run ruff format --check .

# Auto-format code
uv run ruff format .
```

---

## 5. Coding Conventions

1. **Filesystem Portability:** Always use `pathlib.Path` rather than hardcoded `/` or `\` path strings so code works identically on Windows and Linux.
2. **Type Annotations:** All public functions, methods, dataclasses, and repository protocols must carry explicit type annotations (`from __future__ import annotations`).
3. **Domain Purity:** Modules under `app/domain/` must never import `sqlite3`, `telethon`, `fastapi`, or HTTP/database drivers.
4. **Verbatim Archive Integrity:** Never normalize, strip, or alter `Message.text` when storing or loading archived messages. Search normalization will live in dedicated search columns/indexes in a future milestone.
5. **Secret Hygiene:** Never log or print `TG_API_HASH`, session payloads, phone auth codes, or 2FA passwords.

---

## 6. Git Workflow

- Work on focused feature/milestone branches (`milestone-0-foundation`, `feat/telethon-auth`, etc.).
- Before committing, ensure:
  1. `uv run ruff check .` passes with zero warnings.
  2. `uv run ruff format --check .` passes cleanly.
  3. `uv run pytest` passes 100%.
- Verify `git status` never stages `.env`, `*.session*`, `*.db*`, or runtime files inside `data/`.
