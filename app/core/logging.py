"""Centralized logging with console + file output and secret redaction."""

from __future__ import annotations

import logging
import re
import sys
import time
from pathlib import Path

from app.core.config import AppConfig

LOGGER_NAMESPACE = "tke"
LOG_FILENAME = "tke.log"
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

_SENSITIVE_KEY_PATTERN = re.compile(
    r"(?i)\b(tg_api_hash|api_hash|session_string|session|auth_code|phone_code|password|access_token|token)"
    r"(\s*[=:]\s*)([^\s,;\"']+)"
)


class SensitiveDataFilter(logging.Filter):
    """Redacts credentials, tokens, auth codes, and configured secrets from log records."""

    def __init__(self, explicit_secrets: tuple[str, ...] = ()) -> None:
        super().__init__()
        self._secrets = tuple(s for s in explicit_secrets if s and len(s) >= 4)

    def _sanitize(self, text: str) -> str:
        sanitized = _SENSITIVE_KEY_PATTERN.sub(r"\1\2[REDACTED]", text)
        for secret in self._secrets:
            if secret in sanitized:
                sanitized = sanitized.replace(secret, "[REDACTED]")
        return sanitized

    def filter(self, record: logging.LogRecord) -> bool:
        rendered = record.getMessage()
        record.msg = self._sanitize(rendered)
        record.args = None
        return True


class UTCFormatter(logging.Formatter):
    """Formats log timestamps consistently in UTC."""

    converter = time.gmtime


def configure_logging(config: AppConfig, log_filename: str = LOG_FILENAME) -> logging.Logger:
    """Configure console and UTF-8 file logging under ``config.log_dir``.

    Safe to call multiple times: existing handlers on the ``tke`` namespace logger
    are closed and replaced cleanly without duplicating log lines.
    """
    config.log_dir.mkdir(parents=True, exist_ok=True)
    log_file_path: Path = config.log_dir / log_filename

    logger = logging.getLogger(LOGGER_NAMESPACE)
    logger.setLevel(getattr(logging, config.app_log_level))
    logger.propagate = False

    for existing_handler in list(logger.handlers):
        logger.removeHandler(existing_handler)
        existing_handler.close()

    secrets = (config.tg_api_hash,) if config.tg_api_hash else ()
    redaction_filter = SensitiveDataFilter(explicit_secrets=secrets)
    formatter = UTCFormatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT)

    console_handler = logging.StreamHandler(stream=sys.stdout)
    console_handler.setLevel(getattr(logging, config.app_log_level))
    console_handler.setFormatter(formatter)
    console_handler.addFilter(redaction_filter)

    file_handler = logging.FileHandler(log_file_path, mode="a", encoding="utf-8")
    file_handler.setLevel(getattr(logging, config.app_log_level))
    file_handler.setFormatter(formatter)
    file_handler.addFilter(redaction_filter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


def get_logger(name: str) -> logging.Logger:
    """Return a child logger under the application ``tke`` namespace."""
    if name == LOGGER_NAMESPACE or name.startswith(f"{LOGGER_NAMESPACE}."):
        return logging.getLogger(name)
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{name}")
