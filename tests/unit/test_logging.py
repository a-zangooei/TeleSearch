"""Unit tests for centralized logging configuration and secret redaction."""

from __future__ import annotations

from pathlib import Path

from app.core.config import AppConfig
from app.core.logging import LOG_FILENAME, configure_logging, get_logger


def test_logging_writes_to_file_and_redacts_secrets(tmp_path: Path) -> None:
    secret_hash = "9f8e7d6c5b4a3210secret"
    config = AppConfig(
        app_env="testing",
        app_log_level="INFO",
        database_path=tmp_path / "db.sqlite",
        log_dir=tmp_path / "logs",
        tg_api_id=1001,
        tg_api_hash=secret_hash,
    )

    root_logger = configure_logging(config)
    child_logger = get_logger("tests.redaction")

    try:
        child_logger.debug("Debug line should be filtered at INFO level")
        child_logger.info(
            "Connecting with api_hash=%s password=my_2fa_pass phone_code: 88421 raw=%s",
            secret_hash,
            secret_hash,
        )
    finally:
        for handler in list(root_logger.handlers):
            handler.flush()
            handler.close()
            root_logger.removeHandler(handler)

    log_file = tmp_path / "logs" / LOG_FILENAME
    assert log_file.is_file()
    contents = log_file.read_text(encoding="utf-8")

    assert "Debug line should be filtered" not in contents
    assert secret_hash not in contents
    assert "my_2fa_pass" not in contents
    assert "88421" not in contents
    assert "[REDACTED]" in contents
