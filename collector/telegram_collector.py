"""
Telegram Knowledge Engine — Local MTProto Text-Only Collector (Milestone 0 / Phase 1-2)

Security & Scope Guarantees:
1. Strictly Text-Only: Never calls download_media() or downloads files/photos/videos.
2. Local Session Only: Reads TG_API_ID and TG_API_HASH from local .env; session stays on disk.
3. Resumable Checkpoints: Fetches history in streaming batches and updates sync_state in SQLite.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sqlite3
import unicodedata
from datetime import timezone
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

try:
    from telethon import TelegramClient, errors
except ImportError:  # pragma: no cover - installed in local Python venv via `uv sync`
    TelegramClient = None  # type: ignore
    errors = None  # type: ignore

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("tke.collector")

URL_REGEX = re.compile(r"https?://[^\s<>()\"']+", re.IGNORECASE)
ARABIC_DIACRITICS = re.compile(r"[\u064B-\u065F\u0670\u0640]")


def normalize_persian_text(text: str) -> str:
    """Normalize Arabic/Persian character variants for consistent FTS5 indexing."""
    if not text:
        return ""
    out = unicodedata.normalize("NFC", text)
    out = (
        out.replace("ي", "ی")
        .replace("ى", "ی")
        .replace("ئ", "ی")
        .replace("ك", "ک")
        .replace("\u200c", " ")
    )
    out = ARABIC_DIACRITICS.sub("", out)
    out = re.sub(r"\s+", " ", out).strip().lower()
    return out


def extract_links(text: str) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    for match in URL_REGEX.findall(text or ""):
        cleaned = match.rstrip(".,;:!?)،؛")
        parsed = urlparse(cleaned)
        if parsed.netloc:
            results.append((cleaned, parsed.netloc.lower()))
    return results


class LocalArchiveCollector:
    def __init__(self, db_path: str, account_id: int = 1) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.account_id = account_id

    async def import_chat_history(
        self,
        client: TelegramClient,
        chat_id: int,
        batch_size: int = 200,
    ) -> int:
        """Stream text-only messages in batches and persist checkpoints atomically."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        cursor = conn.cursor()

        row = cursor.execute(
            "SELECT checkpoint_msg_id FROM sync_state WHERE account_id = ? AND chat_id = ?",
            (self.account_id, chat_id),
        ).fetchone()
        min_id = int(row[0]) if row and row[0] else 0

        imported_total = 0
        batch: list[tuple] = []

        while True:
            try:
                async for msg in client.iter_messages(
                    chat_id, min_id=min_id, limit=batch_size, reverse=True
                ):
                    raw_text = (msg.message or "").strip()
                    has_media = 1 if msg.media is not None else 0
                    if not raw_text and not has_media:
                        continue

                    msg_date = (
                        msg.date.astimezone(timezone.utc).isoformat()
                        if msg.date
                        else ""
                    )
                    edit_date = (
                        msg.edit_date.astimezone(timezone.utc).isoformat()
                        if getattr(msg, "edit_date", None)
                        else None
                    )
                    reply_to = (
                        msg.reply_to.reply_to_msg_id
                        if getattr(msg, "reply_to", None)
                        else None
                    )
                    batch.append(
                        (
                            self.account_id,
                            chat_id,
                            msg.id,
                            getattr(msg, "sender_id", None),
                            msg_date,
                            edit_date,
                            raw_text,
                            normalize_persian_text(raw_text),
                            reply_to,
                            getattr(msg, "grouped_id", None),
                            getattr(msg, "views", None),
                            has_media,
                        )
                    )
                    min_id = max(min_id, msg.id)

                if not batch:
                    break

                with conn:
                    for item in batch:
                        conn.execute(
                            """
                            INSERT INTO messages (
                                account_id, chat_id, message_id, sender_id, date, edit_date,
                                text, normalized_text, reply_to_msg_id, grouped_id, views, has_media
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(account_id, chat_id, message_id) DO UPDATE SET
                                edit_date = excluded.edit_date,
                                text = excluded.text,
                                normalized_text = excluded.normalized_text,
                                views = excluded.views,
                                updated_at = CURRENT_TIMESTAMP
                            """,
                            item,
                        )
                        for url, domain in extract_links(item[6]):
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO message_links
                                (account_id, chat_id, message_id, url, domain)
                                VALUES (?, ?, ?, ?, ?)
                                """,
                                (self.account_id, chat_id, item[2], url, domain),
                            )

                    conn.execute(
                        """
                        INSERT INTO sync_state (account_id, chat_id, checkpoint_msg_id, imported_count, status)
                        VALUES (?, ?, ?, ?, 'COMPLETED')
                        ON CONFLICT(account_id, chat_id) DO UPDATE SET
                            checkpoint_msg_id = excluded.checkpoint_msg_id,
                            imported_count = sync_state.imported_count + ?,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (self.account_id, chat_id, min_id, len(batch), len(batch)),
                    )

                imported_total += len(batch)
                logger.info(
                    "Imported batch | chat_id=%s count=%s checkpoint=%s",
                    chat_id,
                    len(batch),
                    min_id,
                )
                batch.clear()

            except Exception as exc:
                if errors and isinstance(exc, errors.FloodWaitError):
                    wait_seconds = int(exc.seconds) + 1
                    logger.warning(
                        "FloodWait received | chat_id=%s sleeping=%ss",
                        chat_id,
                        wait_seconds,
                    )
                    await asyncio.sleep(wait_seconds)
                    continue
                logger.error("Import error | chat_id=%s err=%s", chat_id, type(exc).__name__)
                raise

        conn.close()
        return imported_total


async def run_cli() -> None:
    if TelegramClient is None:
        raise RuntimeError("Install dependencies first: uv sync")

    api_id = int(os.environ["TG_API_ID"])
    api_hash = os.environ["TG_API_HASH"]
    session_path = os.getenv("TG_SESSION_PATH", "data/telegram_session")
    db_path = os.getenv("SQLITE_DB_PATH", "data/database/telegram_archive.db")

    Path(session_path).parent.mkdir(parents=True, exist_ok=True)
    async with TelegramClient(session_path, api_id, api_hash) as client:
        logger.info("Connected to Telegram MTProto locally. Listing accessible dialogs:")
        async for dialog in client.iter_dialogs(limit=25):
            logger.info("Dialog | id=%s | type=%s | title=%s", dialog.id, type(dialog.entity).__name__, dialog.name)
        _ = LocalArchiveCollector(db_path=db_path)


if __name__ == "__main__":
    asyncio.run(run_cli())
