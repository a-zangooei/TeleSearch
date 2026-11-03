"""Unit tests for centralized configuration loading and validation."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import (
    DEFAULT_APP_ENV,
    DEFAULT_DATABASE_PATH,
    DEFAULT_LOG_LEVEL,
    DEFAULT_TG_SESSION_PATH,
    AppConfig,
    load_config,
)
from app.core.exceptions import ConfigurationError


def test_default_configuration_works_without_telegram_credentials(tmp_path: Path) -> None:
    missing_env = tmp_path / "nonexistent.env"
    config = load_config(env_file=missing_env, environ={})

    assert config.app_env == DEFAULT_APP_ENV
    assert config.app_log_level == DEFAULT_LOG_LEVEL
    assert config.database_path == DEFAULT_DATABASE_PATH
    assert config.tg_session_path == DEFAULT_TG_SESSION_PATH
    assert config.tg_api_id is None
    assert config.tg_api_hash is None


def test_load_config_reads_dotenv_and_allows_environ_override(tmp_path: Path) -> None:
    dotenv_file = tmp_path / ".env"
    dotenv_file.write_text(
        "\n".join(
            [
                "APP_ENV=development",
                "APP_LOG_LEVEL=debug",
                "DATABASE_PATH=data/database/from_dotenv.db",
                "TG_API_ID=123456",
                "TG_API_HASH=super_secret_hash_value",
                "TG_SESSION_PATH=data/custom_session",
            ]
        ),
        encoding="utf-8",
    )

    config = load_config(
        env_file=dotenv_file,
        environ={
            "APP_ENV": "testing",
            "DATABASE_PATH": "data/database/from_env.db",
        },
    )

    assert config.app_env == "testing"
    assert config.app_log_level == "DEBUG"
    assert config.database_path == Path("data/database/from_env.db")
    assert config.tg_api_id == 123456
    assert config.tg_api_hash == "super_secret_hash_value"
    assert config.tg_session_path == Path("data/custom_session")


def test_secret_hash_is_excluded_from_repr() -> None:
    config = AppConfig(tg_api_id=999, tg_api_hash="ultra_secret_api_hash")
    rendered = repr(config)
    assert "ultra_secret_api_hash" not in rendered


def test_require_telegram_credentials_raises_when_missing() -> None:
    config = AppConfig()
    with pytest.raises(ConfigurationError, match="TG_API_ID and TG_API_HASH"):
        config.require_telegram_credentials()

    ready = AppConfig(tg_api_id=42, tg_api_hash="hash_abc123")
    assert ready.require_telegram_credentials() == (42, "hash_abc123")


@pytest.mark.parametrize(
    ("env_map", "expected_match"),
    [
        ({"APP_ENV": "staging"}, "Invalid APP_ENV"),
        ({"APP_LOG_LEVEL": "VERBOSE"}, "Invalid APP_LOG_LEVEL"),
        ({"TG_API_ID": "not_an_int"}, "Invalid TG_API_ID"),
        ({"TG_API_ID": "-5"}, "TG_API_ID must be a positive integer"),
        ({"DATABASE_PATH": "   "}, "DATABASE_PATH must not be empty"),
        ({"TG_SESSION_PATH": "  "}, "TG_SESSION_PATH must not be empty"),
    ],
)
def test_invalid_configuration_raises_clear_error(
    tmp_path: Path,
    env_map: dict[str, str],
    expected_match: str,
) -> None:
    with pytest.raises(ConfigurationError, match=expected_match):
        load_config(env_file=tmp_path / "none.env", environ=env_map)
