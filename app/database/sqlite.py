"""Local SQLite database manager, connection/transaction handling, and migration runner."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.exceptions import DatabaseError, MigrationError
from app.core.logging import get_logger

logger = get_logger("database.sqlite")

DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
REQUIRED_TABLES: frozenset[str] = frozenset(
    {"schema_migrations", "chats", "users", "messages", "sync_state"}
)


def split_sql_statements(sql_script: str) -> list[str]:
    """Split a SQL script into individual executable statements using sqlite3.complete_statement.

    Avoids ``sqlite3.Connection.executescript`` so multi-statement migrations can run
    inside an explicit atomic ``BEGIN ... COMMIT / ROLLBACK`` transaction.
    """
    statements: list[str] = []
    buffer_lines: list[str] = []

    for line in sql_script.splitlines(keepends=True):
        stripped = line.strip()
        if not buffer_lines and (not stripped or stripped.startswith("--")):
            continue
        buffer_lines.append(line)
        candidate = "".join(buffer_lines)
        if sqlite3.complete_statement(candidate):
            cleaned = "\n".join(
                part for part in candidate.splitlines() if not part.strip().startswith("--")
            ).strip()
            if cleaned:
                statements.append(candidate.strip())
            buffer_lines.clear()

    remainder = "".join(buffer_lines).strip()
    if remainder:
        non_comment = "\n".join(
            part for part in remainder.splitlines() if not part.strip().startswith("--")
        ).strip()
        if non_comment:
            raise MigrationError(f"Incomplete SQL statement in migration: {remainder[:120]}")

    return statements


class SQLiteDatabase:
    """Manages local SQLite connections, pragmas, atomic transactions, and SQL migrations."""

    def __init__(
        self,
        database_path: Path | str,
        *,
        migrations_dir: Path | None = None,
        busy_timeout_ms: int = 5000,
    ) -> None:
        self._database_path = Path(database_path)
        self._migrations_dir = migrations_dir or DEFAULT_MIGRATIONS_DIR
        self._busy_timeout_ms = busy_timeout_ms
        self._active_conn: sqlite3.Connection | None = None
        self._savepoint_depth: int = 0

    @property
    def database_path(self) -> Path:
        """Filesystem path to the SQLite database file."""
        return self._database_path

    def _open_connection(self) -> sqlite3.Connection:
        try:
            self._database_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self._database_path, isolation_level=None)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute(f"PRAGMA busy_timeout = {int(self._busy_timeout_ms)};")
            return conn
        except sqlite3.Error as exc:
            raise DatabaseError(
                f"Failed to open SQLite database at '{self._database_path}': {exc}"
            ) from exc

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Provide a read connection (reusing the active transaction connection if present)."""
        if self._active_conn is not None:
            yield self._active_conn
            return

        conn = self._open_connection()
        try:
            yield conn
        except sqlite3.Error as exc:
            raise DatabaseError(f"SQLite query failed: {exc}") from exc
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Provide an atomic write transaction with nested savepoint support."""
        if self._active_conn is not None:
            self._savepoint_depth += 1
            savepoint_name = f"tke_sp_{self._savepoint_depth}"
            self._active_conn.execute(f"SAVEPOINT {savepoint_name}")
            try:
                yield self._active_conn
            except Exception as exc:
                self._active_conn.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                self._active_conn.execute(f"RELEASE SAVEPOINT {savepoint_name}")
                if isinstance(exc, sqlite3.Error) and not isinstance(exc, DatabaseError):
                    raise DatabaseError(f"Database operation failed: {exc}") from exc
                raise
            else:
                self._active_conn.execute(f"RELEASE SAVEPOINT {savepoint_name}")
            finally:
                self._savepoint_depth -= 1
            return

        conn = self._open_connection()
        self._active_conn = conn
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
        except Exception as exc:
            with suppress(sqlite3.Error):
                conn.execute("ROLLBACK")
            if isinstance(exc, sqlite3.Error) and not isinstance(exc, DatabaseError):
                raise DatabaseError(f"Database transaction rolled back: {exc}") from exc
            raise
        else:
            try:
                conn.execute("COMMIT")
            except sqlite3.Error as exc:
                raise DatabaseError(f"Failed to commit transaction: {exc}") from exc
        finally:
            self._active_conn = None
            conn.close()

    def initialize(self) -> list[str]:
        """Ensure database directory exists and apply pending SQL migrations idempotently."""
        if not self._migrations_dir.is_dir():
            raise MigrationError(f"Migrations directory not found: '{self._migrations_dir}'")

        migration_files = sorted(self._migrations_dir.glob("*.sql"))
        if not migration_files:
            raise MigrationError(f"No SQL migration files found in '{self._migrations_dir}'")

        with self.transaction() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
            applied_versions = {str(row["version"]) for row in rows}

        newly_applied: list[str] = []
        for migration_file in migration_files:
            version = migration_file.stem
            if version in applied_versions:
                continue

            sql_text = migration_file.read_text(encoding="utf-8")
            statements = split_sql_statements(sql_text)
            applied_at = datetime.now(UTC).isoformat()

            try:
                with self.transaction() as conn:
                    for statement in statements:
                        conn.execute(statement)
                    conn.execute(
                        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                        (version, applied_at),
                    )
            except DatabaseError as exc:
                raise MigrationError(
                    f"Failed applying migration '{migration_file.name}': {exc}"
                ) from exc

            newly_applied.append(version)
            logger.info("Applied database migration: %s", version)

        return newly_applied

    def list_applied_migrations(self) -> list[str]:
        """Return ordered list of applied migration versions."""
        with self.connection() as conn:
            table_exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
            ).fetchone()
            if table_exists is None:
                return []
            rows = conn.execute(
                "SELECT version FROM schema_migrations ORDER BY version ASC"
            ).fetchall()
            return [str(row["version"]) for row in rows]

    def health_check(self) -> dict[str, Any]:
        """Perform an offline SQLite readiness, pragma, and schema integrity check."""
        with self.connection() as conn:
            ping = conn.execute("SELECT 1 AS ok").fetchone()
            fk_row = conn.execute("PRAGMA foreign_keys;").fetchone()
            foreign_keys_enabled = bool(fk_row[0]) if fk_row is not None else False

            table_rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
            existing_tables = sorted(str(row["name"]) for row in table_rows)
            missing_tables = sorted(REQUIRED_TABLES - set(existing_tables))

            migrations: list[str] = []
            if "schema_migrations" in existing_tables:
                mig_rows = conn.execute(
                    "SELECT version FROM schema_migrations ORDER BY version ASC"
                ).fetchall()
                migrations = [str(row["version"]) for row in mig_rows]

        healthy = (
            ping is not None
            and int(ping["ok"]) == 1
            and foreign_keys_enabled
            and not missing_tables
        )
        return {
            "healthy": healthy,
            "database_path": str(self._database_path),
            "sqlite_version": sqlite3.sqlite_version,
            "foreign_keys_enabled": foreign_keys_enabled,
            "tables": existing_tables,
            "missing_tables": missing_tables,
            "applied_migrations": migrations,
        }
