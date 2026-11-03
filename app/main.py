"""Minimal Milestone 0 offline entrypoint for Telegram Knowledge Engine."""

from __future__ import annotations

import sys
from pathlib import Path

from app.core.config import load_config
from app.core.exceptions import TKEError
from app.core.logging import configure_logging, get_logger
from app.database.sqlite import SQLiteDatabase


def run(env_file: Path | str | None = ".env") -> int:
    """Load configuration, initialize logging & SQLite schema, verify health, and exit."""
    try:
        config = load_config(env_file=env_file)
    except TKEError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1

    root_logger = configure_logging(config)
    logger = get_logger("main")

    try:
        logger.info(
            "Starting Telegram Knowledge Engine foundation (env=%s, db=%s)",
            config.app_env,
            config.database_path,
        )

        database = SQLiteDatabase(config.database_path)
        newly_applied = database.initialize()
        if newly_applied:
            logger.info("Applied %d migration(s): %s", len(newly_applied), ", ".join(newly_applied))
        else:
            logger.info("Database schema is up to date.")

        health = database.health_check()
        if not health["healthy"]:
            logger.error("Database health check failed: %s", health)
            return 1

        logger.info(
            "Database health check passed (sqlite=%s, foreign_keys=%s, tables=%s)",
            health["sqlite_version"],
            health["foreign_keys_enabled"],
            ",".join(health["tables"]),
        )
        logger.info("Milestone 0 initialization complete. Exiting cleanly.")
        return 0
    except TKEError as exc:
        logger.error("Application initialization error: %s", exc)
        return 1
    finally:
        for handler in list(root_logger.handlers):
            handler.flush()
            handler.close()
            root_logger.removeHandler(handler)


def main() -> None:
    """CLI entrypoint for ``python -m app.main``."""
    raise SystemExit(run())


if __name__ == "__main__":
    main()
