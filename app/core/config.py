"""Centralized, credential-safe configuration management."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

from app.core.exceptions import ConfigurationError

ALLOWED_ENVIRONMENTS: frozenset[str] = frozenset({"development", "testing", "production"})
ALLOWED_LOG_LEVELS: frozenset[str] = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})

DEFAULT_APP_ENV = "development"
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_DATABASE_PATH = Path("data/database/telegram_archive.db")
DEFAULT_LOG_DIR = Path("data/logs")
DEFAULT_TG_SESSION_PATH = Path("data/telegram_session")


@dataclass(frozen=True, slots=True)
class AppConfig:
    """Immutable application configuration with lazy credential validation."""

    app_env: str = DEFAULT_APP_ENV
    app_log_level: str = DEFAULT_LOG_LEVEL
    database_path: Path = DEFAULT_DATABASE_PATH
    log_dir: Path = DEFAULT_LOG_DIR
    tg_api_id: int | None = None
    tg_api_hash: str | None = field(default=None, repr=False)
    tg_session_path: Path = DEFAULT_TG_SESSION_PATH

    def __post_init__(self) -> None:
        normalized_env = self.app_env.strip().lower()
        if normalized_env not in ALLOWED_ENVIRONMENTS:
            allowed = ", ".join(sorted(ALLOWED_ENVIRONMENTS))
            raise ConfigurationError(
                f"Invalid APP_ENV '{self.app_env}'. Expected one of: {allowed}."
            )
        object.__setattr__(self, "app_env", normalized_env)

        normalized_level = self.app_log_level.strip().upper()
        if normalized_level not in ALLOWED_LOG_LEVELS:
            allowed_levels = ", ".join(sorted(ALLOWED_LOG_LEVELS))
            raise ConfigurationError(
                f"Invalid APP_LOG_LEVEL '{self.app_log_level}'. Expected one of: {allowed_levels}."
            )
        object.__setattr__(self, "app_log_level", normalized_level)

        if not str(self.database_path).strip():
            raise ConfigurationError("DATABASE_PATH must not be empty.")

        if not str(self.log_dir).strip():
            raise ConfigurationError("Log directory path must not be empty.")

        if not str(self.tg_session_path).strip():
            raise ConfigurationError("TG_SESSION_PATH must not be empty.")

        if self.tg_api_id is not None and (isinstance(self.tg_api_id, bool) or self.tg_api_id <= 0):
            raise ConfigurationError("TG_API_ID must be a positive integer when provided.")

        if self.tg_api_hash is not None:
            cleaned_hash = self.tg_api_hash.strip()
            object.__setattr__(self, "tg_api_hash", cleaned_hash or None)

    def require_telegram_credentials(self) -> tuple[int, str]:
        """Validate and return Telegram credentials only when a Telegram feature needs them."""
        if self.tg_api_id is None or not self.tg_api_hash:
            raise ConfigurationError(
                "Telegram credentials (TG_API_ID and TG_API_HASH) are required "
                "for Telegram connectivity."
            )
        return self.tg_api_id, self.tg_api_hash


def load_config(
    env_file: Path | str | None = ".env",
    environ: Mapping[str, str] | None = None,
) -> AppConfig:
    """Load configuration from an optional .env file and environment variables.

    Explicit environment variables take precedence over values in ``.env``.
    Telegram credentials are optional at startup so local database operations and
    tests work completely offline without credentials.
    """
    merged: dict[str, str] = {}

    if env_file is not None:
        env_path = Path(env_file)
        if env_path.is_file():
            file_values = dotenv_values(env_path)
            for key, value in file_values.items():
                if value is not None:
                    merged[key] = value

    source_env = os.environ if environ is None else environ
    for key, value in source_env.items():
        merged[key] = value

    app_env = merged.get("APP_ENV", DEFAULT_APP_ENV).strip() or DEFAULT_APP_ENV
    app_log_level = merged.get("APP_LOG_LEVEL", DEFAULT_LOG_LEVEL).strip() or DEFAULT_LOG_LEVEL

    raw_db_path = merged.get("DATABASE_PATH")
    if raw_db_path is not None and not raw_db_path.strip():
        raise ConfigurationError("DATABASE_PATH must not be empty when set.")
    database_path = Path(raw_db_path.strip()) if raw_db_path else DEFAULT_DATABASE_PATH

    raw_log_dir = merged.get("APP_LOG_DIR")
    log_dir = Path(raw_log_dir.strip()) if raw_log_dir and raw_log_dir.strip() else DEFAULT_LOG_DIR

    raw_api_id = merged.get("TG_API_ID", "").strip()
    tg_api_id: int | None = None
    if raw_api_id:
        try:
            tg_api_id = int(raw_api_id)
        except ValueError as exc:
            raise ConfigurationError(
                f"Invalid TG_API_ID '{raw_api_id}'. Must be a positive integer."
            ) from exc

    raw_api_hash = merged.get("TG_API_HASH", "").strip()
    tg_api_hash = raw_api_hash or None

    raw_session_path = merged.get("TG_SESSION_PATH")
    if raw_session_path is not None and not raw_session_path.strip():
        raise ConfigurationError("TG_SESSION_PATH must not be empty when set.")
    tg_session_path = (
        Path(raw_session_path.strip()) if raw_session_path else DEFAULT_TG_SESSION_PATH
    )

    return AppConfig(
        app_env=app_env,
        app_log_level=app_log_level,
        database_path=database_path,
        log_dir=log_dir,
        tg_api_id=tg_api_id,
        tg_api_hash=tg_api_hash,
        tg_session_path=tg_session_path,
    )
