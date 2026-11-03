"""Integration test for the Milestone 0 offline entrypoint (app.main)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.main import run


def test_main_entrypoint_initializes_database_and_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_file = tmp_path / "data" / "database" / "cli_test.db"
    log_dir = tmp_path / "data" / "logs"

    monkeypatch.setenv("APP_ENV", "testing")
    monkeypatch.setenv("APP_LOG_LEVEL", "INFO")
    monkeypatch.setenv("DATABASE_PATH", str(db_file))
    monkeypatch.setenv("APP_LOG_DIR", str(log_dir))
    monkeypatch.delenv("TG_API_ID", raising=False)
    monkeypatch.delenv("TG_API_HASH", raising=False)

    first_exit = run(env_file=tmp_path / "missing.env")
    second_exit = run(env_file=tmp_path / "missing.env")

    assert first_exit == 0
    assert second_exit == 0
    assert db_file.is_file()
    assert (log_dir / "tke.log").is_file()
