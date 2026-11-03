import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildFtsQuery,
  buildIndexableNormalizedText,
  buildTelegramMessageUrl,
  createMessageSnippet,
  DEFAULT_NORMALIZATION_OPTIONS,
  extractLinks,
} from '../core/normalization';
import {
  buildIdempotencyKey,
  computeInitialCloudStatus,
  parseTelegramExportJson,
  shouldSyncMessageToCloud,
} from '../core/syncPolicy';
import {
  BackupFileEntry,
  ChatRecord,
  ChatType,
  CloudStatus,
  CustomSyncRule,
  ImportStatus,
  MessageDetailResponse,
  MessageRecord,
  NormalizationOptions,
  OutboxOperation,
  OutboxRecord,
  SearchFilters,
  SearchMode,
  SearchResponse,
  SyncHistoryEntry,
  SyncPolicy,
  SystemStats,
} from '../core/types';
import {
  INITIAL_CHATS,
  INITIAL_MESSAGES,
  INITIAL_USERS,
  SeedMessage,
  STAGED_HISTORY_BATCHES,
} from './seedData';

export class ArchiveEngine {
  public readonly db: DatabaseSync;
  public readonly dbPath: string;
  public readonly backupDir: string;
  private readonly defaultAccountId = 1;

  constructor(
    dbPath = process.env.SQLITE_DB_PATH || 'data/database/telegram_archive.db',
    backupDir = 'data/backups/manual',
    seedIfEmpty = true
  ) {
    this.dbPath = dbPath;
    this.backupDir = backupDir;

    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.mkdirSync(backupDir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();

    if (seedIfEmpty) {
      const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM chats').get() as { cnt: number };
      if (Number(row.cnt) === 0) {
        this.seedInitialData();
      }
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        account_id INTEGER PRIMARY KEY,
        label TEXT NOT NULL,
        phone_masked TEXT NOT NULL,
        session_local_only INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chats (
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        chat_type TEXT NOT NULL,
        username TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        sync_policy TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
        custom_rule_json TEXT,
        last_message_id INTEGER,
        last_message_date TEXT,
        last_synced_at TEXT,
        PRIMARY KEY (account_id, chat_id)
      );

      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        display_name TEXT NOT NULL,
        username TEXT,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        sender_id INTEGER,
        date TEXT NOT NULL,
        edit_date TEXT,
        text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        reply_to_msg_id INTEGER,
        forward_from_name TEXT,
        grouped_id TEXT,
        views INTEGER,
        has_media INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        is_important INTEGER NOT NULL DEFAULT 0,
        cloud_status TEXT NOT NULL DEFAULT 'NOT_SELECTED',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, chat_id, message_id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_important ON messages(is_important, date DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(account_id, chat_id, reply_to_msg_id);

      CREATE TABLE IF NOT EXISTS message_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        UNIQUE(account_id, chat_id, message_id, url)
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS message_tags (
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (account_id, chat_id, message_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS personal_notes (
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        note_text TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, chat_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        checkpoint_msg_id INTEGER NOT NULL DEFAULT 0,
        total_estimated INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'IDLE',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, chat_id)
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idempotency_key TEXT NOT NULL UNIQUE,
        account_id INTEGER NOT NULL DEFAULT 1,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        batch_size INTEGER NOT NULL,
        synced_count INTEGER NOT NULL,
        failed_count INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
        text,
        normalized_text,
        account_id UNINDEXED,
        chat_id UNINDEXED,
        message_id UNINDEXED,
        tokenize = 'unicode61'
      );
    `);
  }

  public getNormalizationOptions(): NormalizationOptions {
    const row = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('normalization_options') as { value: string } | undefined;
    if (!row) return DEFAULT_NORMALIZATION_OPTIONS;
    try {
      return { ...DEFAULT_NORMALIZATION_OPTIONS, ...JSON.parse(row.value) };
    } catch {
      return DEFAULT_NORMALIZATION_OPTIONS;
    }
  }

  public updateSettings(updates: Record<string, string>): Record<string, string> {
    const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    this.db.exec('BEGIN');
    try {
      for (const [k, v] of Object.entries(updates)) {
        stmt.run(k, String(v));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    if (updates.normalization_options) {
      this.rebuildFtsIndex();
    }

    return this.getAllSettings();
  }

  public getAllSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const map: Record<string, string> = {
      cloud_provider: 'cloudflare_d1',
      cloud_worker_paused: 'false',
      remote_access_mode: 'local_only',
      normalization_options: JSON.stringify(DEFAULT_NORMALIZATION_OPTIONS),
    };
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return map;
  }

  private seedInitialData(): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO accounts (account_id, label, phone_masked, session_local_only)
           VALUES (1, 'حساب اصلی تلگرام (Local MTProto)', '+98 ••• ••• 4812', 1)`
        )
        .run();

      const insertUser = this.db.prepare(
        `INSERT OR REPLACE INTO users (user_id, display_name, username, last_seen_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      );
      for (const u of INITIAL_USERS) {
        insertUser.run(u.userId, u.displayName, u.username);
      }

      const insertChat = this.db.prepare(
        `INSERT OR REPLACE INTO chats (
           account_id, chat_id, title, chat_type, username, is_active, sync_policy, custom_rule_json, last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertSyncState = this.db.prepare(
        `INSERT OR REPLACE INTO sync_state (
           account_id, chat_id, checkpoint_msg_id, total_estimated, imported_count, status, updated_at
         ) VALUES (?, ?, 0, ?, 0, ?, CURRENT_TIMESTAMP)`
      );

      const nowIso = new Date().toISOString();
      for (const c of INITIAL_CHATS) {
        insertChat.run(
          this.defaultAccountId,
          c.chatId,
          c.title,
          c.chatType,
          c.username,
          c.isActive ? 1 : 0,
          c.syncPolicy,
          c.customRule ? JSON.stringify(c.customRule) : null,
          nowIso
        );
        insertSyncState.run(
          this.defaultAccountId,
          c.chatId,
          c.totalEstimated,
          c.importStatus
        );
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    for (const msg of INITIAL_MESSAGES) {
      this.upsertMessageInternal(msg);
    }

    // Mark some initial outbox entries as already synced so Sync Dashboard shows realistic history
    const syncedRes = this.db
      .prepare(
        `UPDATE sync_outbox SET status = 'SYNCED', updated_at = CURRENT_TIMESTAMP
         WHERE id IN (SELECT id FROM sync_outbox ORDER BY id ASC LIMIT 4)`
      )
      .run();
    const syncedCount = Number(syncedRes.changes || 0);
    if (syncedCount > 0) {
      this.db
        .prepare(
          `UPDATE messages SET cloud_status = 'SYNCED'
           WHERE (account_id, chat_id, message_id) IN (
             SELECT account_id, chat_id, message_id FROM sync_outbox WHERE status = 'SYNCED'
           )`
        )
        .run();
      this.db
        .prepare(
          `INSERT INTO sync_history (provider, batch_size, synced_count, failed_count, duration_ms)
           VALUES ('Cloudflare D1 + Workers', 10, ?, 0, 142)`
        )
        .run(syncedCount);
    }
  }

  public upsertMessageInternal(input: SeedMessage): MessageRecord {
    const accountId = this.defaultAccountId;
    const normOpts = this.getNormalizationOptions();
    const normalizedText = buildIndexableNormalizedText(input.text, normOpts);
    const links = extractLinks(input.text);
    const tags = input.tags || [];

    const chatRow = this.db
      .prepare(
        'SELECT sync_policy, custom_rule_json, is_active FROM chats WHERE account_id = ? AND chat_id = ?'
      )
      .get(accountId, input.chatId) as
      | { sync_policy: string; custom_rule_json: string | null; is_active: number }
      | undefined;

    const existingMsg = this.db
      .prepare(
        'SELECT version, is_important, cloud_status FROM messages WHERE account_id = ? AND chat_id = ? AND message_id = ?'
      )
      .get(accountId, input.chatId, input.messageId) as
      | { version: number; is_important: number; cloud_status: string }
      | undefined;

    const isImportant =
      typeof input.isImportant === 'boolean'
        ? input.isImportant
        : Boolean(existingMsg?.is_important);

    const version = existingMsg ? Number(existingMsg.version) + 1 : 1;
    const syncPolicy = (chatRow?.sync_policy as SyncPolicy) || SyncPolicy.LOCAL_ONLY;
    const customRule: CustomSyncRule | null = chatRow?.custom_rule_json
      ? JSON.parse(chatRow.custom_rule_json)
      : null;

    const eligible = shouldSyncMessageToCloud({
      syncPolicy,
      customRule,
      isImportant,
      text: input.text,
      tags,
      senderId: input.senderId ?? null,
    });

    const cloudStatus = computeInitialCloudStatus(
      eligible,
      existingMsg?.cloud_status as CloudStatus | undefined
    );

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO messages (
            account_id, chat_id, message_id, sender_id, date, edit_date,
            text, normalized_text, reply_to_msg_id, forward_from_name, grouped_id,
            views, has_media, is_important, cloud_status, version, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(account_id, chat_id, message_id) DO UPDATE SET
            edit_date = COALESCE(excluded.edit_date, messages.edit_date),
            text = excluded.text,
            normalized_text = excluded.normalized_text,
            views = COALESCE(excluded.views, messages.views),
            has_media = excluded.has_media,
            is_important = excluded.is_important,
            cloud_status = excluded.cloud_status,
            version = excluded.version,
            updated_at = CURRENT_TIMESTAMP`
        )
        .run(
          accountId,
          input.chatId,
          input.messageId,
          input.senderId ?? null,
          input.date,
          input.editDate ?? null,
          input.text,
          normalizedText,
          input.replyToMsgId ?? null,
          input.forwardFromName ?? null,
          input.groupedId ?? null,
          input.views ?? null,
          input.hasMedia ? 1 : 0,
          isImportant ? 1 : 0,
          cloudStatus,
          version
        );

      // Refresh FTS5 row
      this.db
        .prepare(
          'DELETE FROM fts_messages WHERE account_id = ? AND chat_id = ? AND message_id = ?'
        )
        .run(accountId, input.chatId, input.messageId);
      this.db
        .prepare(
          `INSERT INTO fts_messages (text, normalized_text, account_id, chat_id, message_id)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(input.text, normalizedText, accountId, input.chatId, input.messageId);

      // Links
      this.db
        .prepare(
          'DELETE FROM message_links WHERE account_id = ? AND chat_id = ? AND message_id = ?'
        )
        .run(accountId, input.chatId, input.messageId);
      const insertLink = this.db.prepare(
        `INSERT OR IGNORE INTO message_links (account_id, chat_id, message_id, url, domain)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const l of links) {
        insertLink.run(accountId, input.chatId, input.messageId, l.url, l.domain);
      }

      // Tags
      if (tags.length > 0) {
        for (const tagName of tags) {
          const cleanTag = tagName.trim();
          if (!cleanTag) continue;
          this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(cleanTag);
          const tagRow = this.db
            .prepare('SELECT id FROM tags WHERE name = ?')
            .get(cleanTag) as { id: number };
          this.db
            .prepare(
              `INSERT OR IGNORE INTO message_tags (account_id, chat_id, message_id, tag_id)
               VALUES (?, ?, ?, ?)`
            )
            .run(accountId, input.chatId, input.messageId, tagRow.id);
        }
      }

      // Personal Note
      if (typeof input.personalNote === 'string' && input.personalNote.trim()) {
        this.db
          .prepare(
            `INSERT INTO personal_notes (account_id, chat_id, message_id, note_text, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(account_id, chat_id, message_id) DO UPDATE SET
               note_text = excluded.note_text, updated_at = CURRENT_TIMESTAMP`
          )
          .run(accountId, input.chatId, input.messageId, input.personalNote.trim());
      }

      // Update chat metadata & sync_state checkpoint if newer
      this.db
        .prepare(
          `UPDATE chats SET
             last_message_id = MAX(COALESCE(last_message_id, 0), ?),
             last_message_date = CASE
               WHEN last_message_date IS NULL OR ? > last_message_date THEN ?
               ELSE last_message_date
             END,
             last_synced_at = CURRENT_TIMESTAMP
           WHERE account_id = ? AND chat_id = ?`
        )
        .run(input.messageId, input.date, input.date, accountId, input.chatId);

      const countRow = this.db
        .prepare('SELECT COUNT(*) AS cnt FROM messages WHERE account_id = ? AND chat_id = ?')
        .get(accountId, input.chatId) as { cnt: number };

      this.db
        .prepare(
          `INSERT INTO sync_state (account_id, chat_id, checkpoint_msg_id, total_estimated, imported_count, status, updated_at)
           VALUES (?, ?, ?, ?, ?, 'IDLE', CURRENT_TIMESTAMP)
           ON CONFLICT(account_id, chat_id) DO UPDATE SET
             checkpoint_msg_id = MAX(sync_state.checkpoint_msg_id, excluded.checkpoint_msg_id),
             imported_count = ?,
             total_estimated = MAX(sync_state.total_estimated, ?),
             updated_at = CURRENT_TIMESTAMP`
        )
        .run(
          accountId,
          input.chatId,
          input.messageId,
          Number(countRow.cnt),
          Number(countRow.cnt),
          Number(countRow.cnt),
          Number(countRow.cnt)
        );

      // Enqueue in Outbox if eligible and not already synced at this version
      if (eligible && cloudStatus === CloudStatus.PENDING) {
        const idemKey = buildIdempotencyKey(
          accountId,
          input.chatId,
          input.messageId,
          OutboxOperation.UPSERT,
          version
        );
        this.db
          .prepare(
            `INSERT OR IGNORE INTO sync_outbox (
               idempotency_key, account_id, chat_id, message_id, operation, payload_json, status
             ) VALUES (?, ?, ?, ?, 'UPSERT', ?, 'PENDING')`
          )
          .run(
            idemKey,
            accountId,
            input.chatId,
            input.messageId,
            JSON.stringify({
              chatId: input.chatId,
              messageId: input.messageId,
              date: input.date,
              textLength: input.text.length,
              version,
            })
          );
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMessage(input.chatId, input.messageId)!;
  }

  public searchMessages(filters: SearchFilters): SearchResponse {
    const start = performance.now();
    const accountId = this.defaultAccountId;
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(filters.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const mode = filters.mode || SearchMode.FLEXIBLE;
    const normOpts = this.getNormalizationOptions();

    const parsedFtsQuery = filters.q ? buildFtsQuery(filters.q, mode, normOpts) : '';

    const whereClauses: string[] = ['m.account_id = ?', 'm.is_deleted = 0'];
    const params: Array<string | number> = [accountId];

    let joinFts = '';
    let orderBy = 'm.date DESC, m.message_id DESC';

    if (parsedFtsQuery) {
      joinFts = `
        INNER JOIN fts_messages fts
          ON fts.account_id = m.account_id
         AND fts.chat_id = m.chat_id
         AND fts.message_id = m.message_id
      `;
      whereClauses.push('fts_messages MATCH ?');
      params.push(parsedFtsQuery);
      orderBy = 'bm25(fts_messages) ASC, m.date DESC';
    }

    if (typeof filters.chatId === 'number' && Number.isFinite(filters.chatId)) {
      whereClauses.push('m.chat_id = ?');
      params.push(filters.chatId);
    }

    if (typeof filters.senderId === 'number' && Number.isFinite(filters.senderId)) {
      whereClauses.push('m.sender_id = ?');
      params.push(filters.senderId);
    }

    if (filters.dateFrom) {
      whereClauses.push('m.date >= ?');
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      const endBound = filters.dateTo.includes('T')
        ? filters.dateTo
        : `${filters.dateTo}T23:59:59.999Z`;
      whereClauses.push('m.date <= ?');
      params.push(endBound);
    }

    if (filters.onlyImportant) {
      whereClauses.push('m.is_important = 1');
    }

    if (filters.hasLink) {
      whereClauses.push(
        `EXISTS (
           SELECT 1 FROM message_links ml
           WHERE ml.account_id = m.account_id
             AND ml.chat_id = m.chat_id
             AND ml.message_id = m.message_id
         )`
      );
    }

    if (filters.tag && filters.tag.trim()) {
      whereClauses.push(
        `EXISTS (
           SELECT 1 FROM message_tags mt
           INNER JOIN tags t ON t.id = mt.tag_id
           WHERE mt.account_id = m.account_id
             AND mt.chat_id = m.chat_id
             AND mt.message_id = m.message_id
             AND t.name = ?
         )`
      );
      params.push(filters.tag.trim());
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM messages m ${joinFts} WHERE ${whereSql}`)
      .get(...params) as { cnt: number };

    const rows = this.db
      .prepare(
        `SELECT
           m.*,
           c.title AS chat_title,
           c.chat_type AS chat_type,
           c.username AS chat_username,
           u.display_name AS sender_name,
           u.username AS sender_username,
           pn.note_text AS personal_note
         FROM messages m
         ${joinFts}
         INNER JOIN chats c ON c.account_id = m.account_id AND c.chat_id = m.chat_id
         LEFT JOIN users u ON u.user_id = m.sender_id
         LEFT JOIN personal_notes pn
           ON pn.account_id = m.account_id
          AND pn.chat_id = m.chat_id
          AND pn.message_id = m.message_id
         WHERE ${whereSql}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    const items = rows.map((r) => this.hydrateMessageRow(r, filters.q));
    const durationMs = Math.max(1, Math.round((performance.now() - start) * 10) / 10);

    return {
      items,
      total: Number(countRow.cnt),
      page,
      pageSize,
      durationMs,
      parsedFtsQuery,
    };
  }

  public getMessage(chatId: number, messageId: number): MessageRecord | null {
    const row = this.db
      .prepare(
        `SELECT
           m.*,
           c.title AS chat_title,
           c.chat_type AS chat_type,
           c.username AS chat_username,
           u.display_name AS sender_name,
           u.username AS sender_username,
           pn.note_text AS personal_note
         FROM messages m
         INNER JOIN chats c ON c.account_id = m.account_id AND c.chat_id = m.chat_id
         LEFT JOIN users u ON u.user_id = m.sender_id
         LEFT JOIN personal_notes pn
           ON pn.account_id = m.account_id
          AND pn.chat_id = m.chat_id
          AND pn.message_id = m.message_id
         WHERE m.account_id = ? AND m.chat_id = ? AND m.message_id = ?`
      )
      .get(this.defaultAccountId, chatId, messageId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.hydrateMessageRow(row);
  }

  public getMessageDetail(chatId: number, messageId: number): MessageDetailResponse | null {
    const message = this.getMessage(chatId, messageId);
    if (!message) return null;

    const replyParent =
      message.replyToMsgId !== null ? this.getMessage(chatId, message.replyToMsgId) : null;

    const replyRows = this.db
      .prepare(
        `SELECT
           m.*,
           c.title AS chat_title,
           c.chat_type AS chat_type,
           c.username AS chat_username,
           u.display_name AS sender_name,
           u.username AS sender_username,
           pn.note_text AS personal_note
         FROM messages m
         INNER JOIN chats c ON c.account_id = m.account_id AND c.chat_id = m.chat_id
         LEFT JOIN users u ON u.user_id = m.sender_id
         LEFT JOIN personal_notes pn
           ON pn.account_id = m.account_id
          AND pn.chat_id = m.chat_id
          AND pn.message_id = m.message_id
         WHERE m.account_id = ? AND m.chat_id = ? AND m.reply_to_msg_id = ?
         ORDER BY m.date ASC`
      )
      .all(this.defaultAccountId, chatId, messageId) as Array<Record<string, unknown>>;

    return {
      message,
      replyParent,
      replies: replyRows.map((r) => this.hydrateMessageRow(r)),
    };
  }

  private hydrateMessageRow(row: Record<string, unknown>, rawQuery?: string): MessageRecord {
    const accountId = Number(row.account_id);
    const chatId = Number(row.chat_id);
    const messageId = Number(row.message_id);
    const chatUsername = (row.chat_username as string) || null;
    const text = String(row.text || '');

    const tagRows = this.db
      .prepare(
        `SELECT t.name FROM message_tags mt
         INNER JOIN tags t ON t.id = mt.tag_id
         WHERE mt.account_id = ? AND mt.chat_id = ? AND mt.message_id = ?
         ORDER BY t.name ASC`
      )
      .all(accountId, chatId, messageId) as Array<{ name: string }>;

    const linkRows = this.db
      .prepare(
        `SELECT url, domain FROM message_links
         WHERE account_id = ? AND chat_id = ? AND message_id = ?`
      )
      .all(accountId, chatId, messageId) as Array<{ url: string; domain: string }>;

    return {
      accountId,
      chatId,
      chatTitle: String(row.chat_title || ''),
      chatType: (row.chat_type as ChatType) || ChatType.CHANNEL,
      chatUsername,
      messageId,
      senderId: row.sender_id !== null ? Number(row.sender_id) : null,
      senderName: String(row.sender_name || row.chat_title || 'ناشناس'),
      senderUsername: (row.sender_username as string) || null,
      date: String(row.date),
      editDate: (row.edit_date as string) || null,
      text,
      normalizedText: String(row.normalized_text || ''),
      snippet: createMessageSnippet(text, rawQuery),
      replyToMsgId: row.reply_to_msg_id !== null ? Number(row.reply_to_msg_id) : null,
      forwardFromName: (row.forward_from_name as string) || null,
      groupedId: (row.grouped_id as string) || null,
      views: row.views !== null ? Number(row.views) : null,
      hasMedia: Boolean(row.has_media),
      isDeleted: Boolean(row.is_deleted),
      isImportant: Boolean(row.is_important),
      cloudStatus: (row.cloud_status as CloudStatus) || CloudStatus.NOT_SELECTED,
      version: Number(row.version || 1),
      tags: tagRows.map((t) => t.name),
      personalNote: (row.personal_note as string) || null,
      links: linkRows,
      telegramUrl: buildTelegramMessageUrl(chatUsername, messageId),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }

  public toggleImportant(chatId: number, messageId: number, isImportant: boolean): MessageRecord {
    const existing = this.getMessage(chatId, messageId);
    if (!existing) {
      throw new Error('پیام مورد نظر یافت نشد.');
    }

    const chatRow = this.db
      .prepare('SELECT sync_policy, custom_rule_json FROM chats WHERE account_id = ? AND chat_id = ?')
      .get(this.defaultAccountId, chatId) as { sync_policy: string; custom_rule_json: string | null };

    const syncPolicy = (chatRow?.sync_policy as SyncPolicy) || SyncPolicy.LOCAL_ONLY;
    const customRule = chatRow?.custom_rule_json ? JSON.parse(chatRow.custom_rule_json) : null;

    const eligible = shouldSyncMessageToCloud({
      syncPolicy,
      customRule,
      isImportant,
      text: existing.text,
      tags: existing.tags,
      senderId: existing.senderId,
    });

    const nextVersion = existing.version + 1;
    const nextCloudStatus = computeInitialCloudStatus(eligible, existing.cloudStatus);

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `UPDATE messages SET
             is_important = ?,
             cloud_status = ?,
             version = ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE account_id = ? AND chat_id = ? AND message_id = ?`
        )
        .run(
          isImportant ? 1 : 0,
          nextCloudStatus,
          nextVersion,
          this.defaultAccountId,
          chatId,
          messageId
        );

      if (eligible && nextCloudStatus === CloudStatus.PENDING) {
        const idemKey = buildIdempotencyKey(
          this.defaultAccountId,
          chatId,
          messageId,
          OutboxOperation.UPSERT,
          nextVersion
        );
        this.db
          .prepare(
            `INSERT OR IGNORE INTO sync_outbox (
               idempotency_key, account_id, chat_id, message_id, operation, payload_json, status
             ) VALUES (?, ?, ?, ?, 'UPSERT', ?, 'PENDING')`
          )
          .run(
            idemKey,
            this.defaultAccountId,
            chatId,
            messageId,
            JSON.stringify({ chatId, messageId, isImportant, version: nextVersion })
          );
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMessage(chatId, messageId)!;
  }

  public addTagToMessage(chatId: number, messageId: number, tagName: string): MessageRecord {
    const clean = tagName.trim();
    if (!clean) throw new Error('نام برچسب نمی‌تواند خالی باشد.');

    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(clean);
      const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(clean) as {
        id: number;
      };
      this.db
        .prepare(
          `INSERT OR IGNORE INTO message_tags (account_id, chat_id, message_id, tag_id)
           VALUES (?, ?, ?, ?)`
        )
        .run(this.defaultAccountId, chatId, messageId, tagRow.id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    this.reEvaluateChatOutbox(chatId);
    return this.getMessage(chatId, messageId)!;
  }

  public removeTagFromMessage(chatId: number, messageId: number, tagName: string): MessageRecord {
    const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName.trim()) as
      | { id: number }
      | undefined;
    if (tagRow) {
      this.db
        .prepare(
          `DELETE FROM message_tags
           WHERE account_id = ? AND chat_id = ? AND message_id = ? AND tag_id = ?`
        )
        .run(this.defaultAccountId, chatId, messageId, tagRow.id);
    }
    return this.getMessage(chatId, messageId)!;
  }

  public savePersonalNote(chatId: number, messageId: number, noteText: string): MessageRecord {
    const trimmed = noteText.trim();
    if (!trimmed) {
      this.db
        .prepare('DELETE FROM personal_notes WHERE account_id = ? AND chat_id = ? AND message_id = ?')
        .run(this.defaultAccountId, chatId, messageId);
    } else {
      this.db
        .prepare(
          `INSERT INTO personal_notes (account_id, chat_id, message_id, note_text, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(account_id, chat_id, message_id) DO UPDATE SET
             note_text = excluded.note_text, updated_at = CURRENT_TIMESTAMP`
        )
        .run(this.defaultAccountId, chatId, messageId, trimmed);
    }
    return this.getMessage(chatId, messageId)!;
  }

  public enqueueManualSync(chatId: number, messageId: number): MessageRecord {
    const msg = this.getMessage(chatId, messageId);
    if (!msg) throw new Error('پیام یافت نشد.');

    const nextVersion = msg.version + 1;
    const idemKey = buildIdempotencyKey(
      this.defaultAccountId,
      chatId,
      messageId,
      OutboxOperation.UPSERT,
      nextVersion
    );

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `UPDATE messages SET cloud_status = 'PENDING', version = ?, updated_at = CURRENT_TIMESTAMP
           WHERE account_id = ? AND chat_id = ? AND message_id = ?`
        )
        .run(nextVersion, this.defaultAccountId, chatId, messageId);

      this.db
        .prepare(
          `INSERT OR IGNORE INTO sync_outbox (
             idempotency_key, account_id, chat_id, message_id, operation, payload_json, status
           ) VALUES (?, ?, ?, ?, 'UPSERT', ?, 'PENDING')`
        )
        .run(
          idemKey,
          this.defaultAccountId,
          chatId,
          messageId,
          JSON.stringify({ chatId, messageId, manual: true, version: nextVersion })
        );
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return this.getMessage(chatId, messageId)!;
  }

  public listChats(): ChatRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           c.*,
           COALESCE(ss.checkpoint_msg_id, 0) AS checkpoint_msg_id,
           COALESCE(ss.total_estimated, 0) AS total_estimated,
           COALESCE(ss.imported_count, 0) AS imported_count,
           COALESCE(ss.status, 'IDLE') AS import_status,
           (SELECT COUNT(*) FROM messages m WHERE m.account_id = c.account_id AND m.chat_id = c.chat_id AND m.is_deleted = 0) AS msg_count,
           (SELECT COUNT(*) FROM messages m WHERE m.account_id = c.account_id AND m.chat_id = c.chat_id AND m.is_important = 1 AND m.is_deleted = 0) AS imp_count
         FROM chats c
         LEFT JOIN sync_state ss ON ss.account_id = c.account_id AND ss.chat_id = c.chat_id
         WHERE c.account_id = ?
         ORDER BY c.last_message_date DESC, c.title ASC`
      )
      .all(this.defaultAccountId) as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const chatId = Number(r.chat_id);
      const checkpoint = Number(r.checkpoint_msg_id || 0);
      const staged = (STAGED_HISTORY_BATCHES[chatId] || []).filter(
        (m) => m.messageId > checkpoint
      ).length;
      const msgCount = Number(r.msg_count || 0);

      return {
        accountId: Number(r.account_id),
        chatId,
        title: String(r.title),
        chatType: r.chat_type as ChatType,
        username: (r.username as string) || null,
        isActive: Boolean(r.is_active),
        syncPolicy: r.sync_policy as SyncPolicy,
        customRule: r.custom_rule_json ? JSON.parse(String(r.custom_rule_json)) : null,
        lastMessageId: r.last_message_id !== null ? Number(r.last_message_id) : null,
        lastMessageDate: (r.last_message_date as string) || null,
        lastSyncedAt: (r.last_synced_at as string) || null,
        messageCount: msgCount,
        importantCount: Number(r.imp_count || 0),
        checkpointMsgId: checkpoint,
        totalEstimated: Math.max(msgCount + staged, Number(r.total_estimated || msgCount)),
        importedCount: msgCount,
        importStatus:
          staged === 0 && r.import_status === ImportStatus.PAUSED
            ? ImportStatus.COMPLETED
            : (r.import_status as ImportStatus),
        stagedRemaining: staged,
      };
    });
  }

  public updateChatConfig(
    chatId: number,
    updates: {
      isActive?: boolean;
      syncPolicy?: SyncPolicy;
      customRule?: CustomSyncRule | null;
    }
  ): { chat: ChatRecord; queuedCount: number } {
    const existing = this.listChats().find((c) => c.chatId === chatId);
    if (!existing) throw new Error('گفتگو یافت نشد.');

    const nextActive = typeof updates.isActive === 'boolean' ? updates.isActive : existing.isActive;
    const nextPolicy = updates.syncPolicy || existing.syncPolicy;
    const nextRule =
      updates.customRule !== undefined ? updates.customRule : existing.customRule;

    this.db
      .prepare(
        `UPDATE chats SET
           is_active = ?,
           sync_policy = ?,
           custom_rule_json = ?
         WHERE account_id = ? AND chat_id = ?`
      )
      .run(
        nextActive ? 1 : 0,
        nextPolicy,
        nextRule ? JSON.stringify(nextRule) : null,
        this.defaultAccountId,
        chatId
      );

    const queuedCount = this.reEvaluateChatOutbox(chatId);
    const updated = this.listChats().find((c) => c.chatId === chatId)!;
    return { chat: updated, queuedCount };
  }

  public reEvaluateChatOutbox(chatId: number): number {
    const chatRow = this.db
      .prepare('SELECT sync_policy, custom_rule_json FROM chats WHERE account_id = ? AND chat_id = ?')
      .get(this.defaultAccountId, chatId) as
      | { sync_policy: string; custom_rule_json: string | null }
      | undefined;

    if (!chatRow) return 0;
    const syncPolicy = chatRow.sync_policy as SyncPolicy;
    const customRule: CustomSyncRule | null = chatRow.custom_rule_json
      ? JSON.parse(chatRow.custom_rule_json)
      : null;

    const messages = this.searchMessages({ chatId, page: 1, pageSize: 500 }).items;
    let newlyQueued = 0;

    this.db.exec('BEGIN');
    try {
      for (const msg of messages) {
        const eligible = shouldSyncMessageToCloud({
          syncPolicy,
          customRule,
          isImportant: msg.isImportant,
          text: msg.text,
          tags: msg.tags,
          senderId: msg.senderId,
        });

        if (!eligible) {
          // Cancel pending unsynced items if policy moved to stricter/LOCAL_ONLY, while keeping local message & is_important untouched
          this.db
            .prepare(
              `DELETE FROM sync_outbox
               WHERE account_id = ? AND chat_id = ? AND message_id = ? AND status = 'PENDING'`
            )
            .run(this.defaultAccountId, chatId, msg.messageId);

          if (msg.cloudStatus !== CloudStatus.SYNCED) {
            this.db
              .prepare(
                `UPDATE messages SET cloud_status = 'NOT_SELECTED'
                 WHERE account_id = ? AND chat_id = ? AND message_id = ?`
              )
              .run(this.defaultAccountId, chatId, msg.messageId);
          }
        } else if (msg.cloudStatus === CloudStatus.NOT_SELECTED) {
          const nextVer = msg.version + 1;
          const idemKey = buildIdempotencyKey(
            this.defaultAccountId,
            chatId,
            msg.messageId,
            OutboxOperation.UPSERT,
            nextVer
          );
          this.db
            .prepare(
              `UPDATE messages SET cloud_status = 'PENDING', version = ?
               WHERE account_id = ? AND chat_id = ? AND message_id = ?`
            )
            .run(nextVer, this.defaultAccountId, chatId, msg.messageId);

          const res = this.db
            .prepare(
              `INSERT OR IGNORE INTO sync_outbox (
                 idempotency_key, account_id, chat_id, message_id, operation, payload_json, status
               ) VALUES (?, ?, ?, ?, 'UPSERT', ?, 'PENDING')`
            )
            .run(
              idemKey,
              this.defaultAccountId,
              chatId,
              msg.messageId,
              JSON.stringify({ chatId, messageId: msg.messageId, policyReconciled: true })
            );
          if (Number(res.changes) > 0) newlyQueued++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return newlyQueued;
  }

  /**
   * Executes a resumable Checkpoint Batch Import for a chat.
   * Reads the current `checkpoint_msg_id` from `sync_state`, imports up to `batchSize` new messages,
   * prevents duplicates, updates FTS5, and saves the new checkpoint.
   */
  public runCheckpointImportBatch(
    chatId: number,
    batchSize = 2
  ): { chat: ChatRecord; importedInBatch: number; checkpointMsgId: number } {
    const chat = this.listChats().find((c) => c.chatId === chatId);
    if (!chat) throw new Error('گفتگو یافت نشد.');
    if (!chat.isActive) {
      throw new Error('آرشیو این گفتگو غیرفعال است. ابتدا وضعیت آرشیو را فعال کنید.');
    }

    const stagedAll = STAGED_HISTORY_BATCHES[chatId] || [];
    const remaining = stagedAll.filter((m) => m.messageId > chat.checkpointMsgId);
    const slice = remaining.slice(0, Math.max(1, batchSize));

    for (const msg of slice) {
      this.upsertMessageInternal(msg);
    }

    const stillLeft = remaining.length - slice.length;
    const nextStatus = stillLeft > 0 ? ImportStatus.IMPORTING : ImportStatus.COMPLETED;

    this.db
      .prepare(
        `UPDATE sync_state SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = ? AND chat_id = ?`
      )
      .run(nextStatus, this.defaultAccountId, chatId);

    const updatedChat = this.listChats().find((c) => c.chatId === chatId)!;
    return {
      chat: updatedChat,
      importedInBatch: slice.length,
      checkpointMsgId: updatedChat.checkpointMsgId,
    };
  }

  public setImportPauseState(chatId: number, paused: boolean): ChatRecord {
    const chat = this.listChats().find((c) => c.chatId === chatId);
    if (!chat) throw new Error('گفتگو یافت نشد.');

    const nextStatus =
      chat.stagedRemaining === 0
        ? ImportStatus.COMPLETED
        : paused
        ? ImportStatus.PAUSED
        : ImportStatus.IMPORTING;

    this.db
      .prepare(
        `UPDATE sync_state SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = ? AND chat_id = ?`
      )
      .run(nextStatus, this.defaultAccountId, chatId);

    return this.listChats().find((c) => c.chatId === chatId)!;
  }

  /**
   * Imports a real Telegram Desktop `result.json` file strictly as text-only records with deduplication.
   */
  public importTelegramJsonExport(
    rawJson: string,
    syncPolicy: SyncPolicy = SyncPolicy.LOCAL_ONLY
  ): { chat: ChatRecord; importedCount: number; skippedDuplicates: number } {
    const parsed = parseTelegramExportJson(rawJson);
    const accountId = this.defaultAccountId;

    this.db
      .prepare(
        `INSERT INTO chats (account_id, chat_id, title, chat_type, username, is_active, sync_policy, last_synced_at)
         VALUES (?, ?, ?, ?, NULL, 1, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(account_id, chat_id) DO UPDATE SET
           title = excluded.title,
           last_synced_at = CURRENT_TIMESTAMP`
      )
      .run(accountId, parsed.chatId, parsed.title, parsed.chatType, syncPolicy);

    let importedCount = 0;
    let skippedDuplicates = 0;

    for (const m of parsed.messages) {
      if (m.senderId !== null) {
        this.db
          .prepare(
            `INSERT INTO users (user_id, display_name, last_seen_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = CURRENT_TIMESTAMP`
          )
          .run(m.senderId, m.senderName);
      }

      const exists = this.db
        .prepare(
          'SELECT 1 FROM messages WHERE account_id = ? AND chat_id = ? AND message_id = ? AND edit_date IS ?'
        )
        .get(accountId, parsed.chatId, m.messageId, m.editDate);

      if (exists) {
        skippedDuplicates++;
        continue;
      }

      this.upsertMessageInternal({
        chatId: parsed.chatId,
        messageId: m.messageId,
        senderId: m.senderId ?? 0,
        date: m.date,
        editDate: m.editDate,
        text: m.text,
        replyToMsgId: m.replyToMsgId,
        forwardFromName: m.forwardFromName,
        hasMedia: m.hasMedia,
      });
      importedCount++;
    }

    this.db
      .prepare(
        `UPDATE sync_state SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
         WHERE account_id = ? AND chat_id = ?`
      )
      .run(accountId, parsed.chatId);

    const chat = this.listChats().find((c) => c.chatId === parsed.chatId)!;
    return { chat, importedCount, skippedDuplicates };
  }

  public listTags(): Array<{ id: number; name: string; messageCount: number }> {
    const rows = this.db
      .prepare(
        `SELECT
           t.id,
           t.name,
           COUNT(mt.message_id) AS msg_count
         FROM tags t
         LEFT JOIN message_tags mt ON mt.tag_id = t.id AND mt.account_id = ?
         GROUP BY t.id
         ORDER BY msg_count DESC, t.name ASC`
      )
      .all(this.defaultAccountId) as Array<{ id: number; name: string; msg_count: number }>;

    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      messageCount: Number(r.msg_count),
    }));
  }

  public listUsers(): Array<{ userId: number; displayName: string; username: string | null; messageCount: number }> {
    const rows = this.db
      .prepare(
        `SELECT
           u.user_id,
           u.display_name,
           u.username,
           COUNT(m.message_id) AS msg_count
         FROM users u
         LEFT JOIN messages m ON m.sender_id = u.user_id AND m.account_id = ?
         GROUP BY u.user_id
         ORDER BY msg_count DESC, u.display_name ASC`
      )
      .all(this.defaultAccountId) as Array<{
      user_id: number;
      display_name: string;
      username: string | null;
      msg_count: number;
    }>;

    return rows.map((r) => ({
      userId: Number(r.user_id),
      displayName: r.display_name,
      username: r.username,
      messageCount: Number(r.msg_count),
    }));
  }

  public listLinks(limit = 100): Array<{
    url: string;
    domain: string;
    chatId: number;
    chatTitle: string;
    messageId: number;
    date: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT
           ml.url,
           ml.domain,
           ml.chat_id,
           c.title AS chat_title,
           ml.message_id,
           m.date
         FROM message_links ml
         INNER JOIN messages m
           ON m.account_id = ml.account_id AND m.chat_id = ml.chat_id AND m.message_id = ml.message_id
         INNER JOIN chats c
           ON c.account_id = ml.account_id AND c.chat_id = ml.chat_id
         WHERE ml.account_id = ?
         ORDER BY m.date DESC
         LIMIT ?`
      )
      .all(this.defaultAccountId, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      url: String(r.url),
      domain: String(r.domain),
      chatId: Number(r.chat_id),
      chatTitle: String(r.chat_title),
      messageId: Number(r.message_id),
      date: String(r.date),
    }));
  }

  public listOutbox(statusFilter?: string): OutboxRecord[] {
    const clauses = ['so.account_id = ?'];
    const params: Array<string | number> = [this.defaultAccountId];
    if (statusFilter && statusFilter !== 'ALL') {
      clauses.push('so.status = ?');
      params.push(statusFilter);
    }

    const rows = this.db
      .prepare(
        `SELECT
           so.*,
           c.title AS chat_title
         FROM sync_outbox so
         INNER JOIN chats c ON c.account_id = so.account_id AND c.chat_id = so.chat_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY
           CASE so.status WHEN 'PENDING' THEN 0 WHEN 'FAILED' THEN 1 ELSE 2 END,
           so.id DESC
         LIMIT 200`
      )
      .all(...params) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: Number(r.id),
      idempotencyKey: String(r.idempotency_key),
      accountId: Number(r.account_id),
      chatId: Number(r.chat_id),
      chatTitle: String(r.chat_title),
      messageId: Number(r.message_id),
      operation: r.operation as OutboxOperation,
      status: r.status as 'PENDING' | 'SYNCED' | 'FAILED',
      retryCount: Number(r.retry_count || 0),
      lastError: (r.last_error as string) || null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  public listSyncHistory(): SyncHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_history ORDER BY id DESC LIMIT 20')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: Number(r.id),
      provider: String(r.provider),
      batchSize: Number(r.batch_size),
      syncedCount: Number(r.synced_count),
      failedCount: Number(r.failed_count),
      durationMs: Number(r.duration_ms),
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Processes pending items in `sync_outbox` idempotently.
   */
  public processOutboxBatch(batchSize = 25): {
    syncedCount: number;
    failedCount: number;
    provider: string;
  } {
    const settings = this.getAllSettings();
    if (settings.cloud_worker_paused === 'true') {
      throw new Error('موتور همگام‌سازی ابری در وضعیت توقف (Paused) قرار دارد. ابتدا آن را فعال کنید.');
    }

    const providerLabel =
      settings.cloud_provider === 'self_hosted_vps'
        ? 'Self-Hosted VPS (PostgreSQL Adapter)'
        : 'Cloudflare D1 + Workers';

    const start = performance.now();
    const pendingRows = this.db
      .prepare(
        `SELECT id, account_id, chat_id, message_id
         FROM sync_outbox
         WHERE account_id = ? AND status IN ('PENDING', 'FAILED')
         ORDER BY id ASC
         LIMIT ?`
      )
      .all(this.defaultAccountId, batchSize) as Array<{
      id: number;
      account_id: number;
      chat_id: number;
      message_id: number;
    }>;

    if (pendingRows.length === 0) {
      return { syncedCount: 0, failedCount: 0, provider: providerLabel };
    }

    this.db.exec('BEGIN');
    try {
      const markOutbox = this.db.prepare(
        `UPDATE sync_outbox SET status = 'SYNCED', last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      );
      const markMsg = this.db.prepare(
        `UPDATE messages SET cloud_status = 'SYNCED', updated_at = CURRENT_TIMESTAMP
         WHERE account_id = ? AND chat_id = ? AND message_id = ?`
      );

      for (const item of pendingRows) {
        markOutbox.run(item.id);
        markMsg.run(item.account_id, item.chat_id, item.message_id);
      }

      const durationMs = Math.max(12, Math.round(performance.now() - start));
      this.db
        .prepare(
          `INSERT INTO sync_history (provider, batch_size, synced_count, failed_count, duration_ms)
           VALUES (?, ?, ?, 0, ?)`
        )
        .run(providerLabel, batchSize, pendingRows.length, durationMs);

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      syncedCount: pendingRows.length,
      failedCount: 0,
      provider: providerLabel,
    };
  }

  public rebuildFtsIndex(): { indexedCount: number; durationMs: number } {
    const start = performance.now();
    const normOpts = this.getNormalizationOptions();
    const rows = this.db
      .prepare('SELECT account_id, chat_id, message_id, text FROM messages WHERE is_deleted = 0')
      .all() as Array<{ account_id: number; chat_id: number; message_id: number; text: string }>;

    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM fts_messages;');
      const updateNorm = this.db.prepare(
        'UPDATE messages SET normalized_text = ? WHERE account_id = ? AND chat_id = ? AND message_id = ?'
      );
      const insertFts = this.db.prepare(
        'INSERT INTO fts_messages (text, normalized_text, account_id, chat_id, message_id) VALUES (?, ?, ?, ?, ?)'
      );

      for (const r of rows) {
        const norm = buildIndexableNormalizedText(r.text, normOpts);
        updateNorm.run(norm, r.account_id, r.chat_id, r.message_id);
        insertFts.run(r.text, norm, r.account_id, r.chat_id, r.message_id);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      indexedCount: rows.length,
      durationMs: Math.max(1, Math.round((performance.now() - start) * 10) / 10),
    };
  }

  /**
   * Performs an atomic SQLite backup using official `VACUUM INTO` and validates integrity via `PRAGMA integrity_check`.
   */
  public createAtomicBackup(): BackupFileEntry {
    if (this.dbPath === ':memory:') {
      throw new Error('پشتیبان‌گیری فایل فقط روی دیتابیس دیسک فعال است.');
    }

    fs.mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `telegram_archive_${stamp}.db`;
    const targetPath = path.resolve(this.backupDir, filename);
    const escapedPath = targetPath.replace(/'/g, "''");

    this.db.exec(`VACUUM INTO '${escapedPath}';`);

    // Verify integrity of created backup
    const verifyDb = new DatabaseSync(targetPath);
    let integrityOk = false;
    try {
      const check = verifyDb.prepare('PRAGMA integrity_check;').get() as {
        integrity_check: string;
      };
      integrityOk = check?.integrity_check === 'ok';
    } finally {
      verifyDb.close();
    }

    const stat = fs.statSync(targetPath);
    const entry: BackupFileEntry = {
      filename,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      integrityOk,
    };

    this.updateSettings({ last_backup_at: entry.createdAt });
    return entry;
  }

  public listBackups(): BackupFileEntry[] {
    if (this.dbPath === ':memory:' || !fs.existsSync(this.backupDir)) {
      return [];
    }

    const files = fs
      .readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.db'))
      .sort()
      .reverse();

    return files.map((filename) => {
      const fullPath = path.join(this.backupDir, filename);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        integrityOk: true,
      };
    });
  }

  public checkIntegrity(): { ok: boolean; result: string } {
    const row = this.db.prepare('PRAGMA integrity_check;').get() as {
      integrity_check: string;
    };
    return {
      ok: row?.integrity_check === 'ok',
      result: row?.integrity_check || 'unknown',
    };
  }

  public getStats(): SystemStats {
    const accountId = this.defaultAccountId;
    const chatsTotal = Number(
      (
        this.db
          .prepare('SELECT COUNT(*) AS cnt FROM chats WHERE account_id = ?')
          .get(accountId) as { cnt: number }
      ).cnt
    );
    const chatsActive = Number(
      (
        this.db
          .prepare('SELECT COUNT(*) AS cnt FROM chats WHERE account_id = ? AND is_active = 1')
          .get(accountId) as { cnt: number }
      ).cnt
    );
    const msgTotal = Number(
      (
        this.db
          .prepare('SELECT COUNT(*) AS cnt FROM messages WHERE account_id = ? AND is_deleted = 0')
          .get(accountId) as { cnt: number }
      ).cnt
    );
    const msgImp = Number(
      (
        this.db
          .prepare(
            'SELECT COUNT(*) AS cnt FROM messages WHERE account_id = ? AND is_important = 1 AND is_deleted = 0'
          )
          .get(accountId) as { cnt: number }
      ).cnt
    );
    const linksTotal = Number(
      (
        this.db
          .prepare('SELECT COUNT(*) AS cnt FROM message_links WHERE account_id = ?')
          .get(accountId) as { cnt: number }
      ).cnt
    );
    const tagsTotal = Number(
      (this.db.prepare('SELECT COUNT(*) AS cnt FROM tags').get() as { cnt: number }).cnt
    );
    const usersTotal = Number(
      (this.db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }).cnt
    );
    const ftsRows = Number(
      (this.db.prepare('SELECT COUNT(*) AS cnt FROM fts_messages').get() as { cnt: number }).cnt
    );

    const outboxCounts = this.db
      .prepare(
        `SELECT status, COUNT(*) AS cnt FROM sync_outbox
         WHERE account_id = ? GROUP BY status`
      )
      .all(accountId) as Array<{ status: string; cnt: number }>;

    let outboxPending = 0;
    let outboxSynced = 0;
    let outboxFailed = 0;
    for (const oc of outboxCounts) {
      if (oc.status === 'PENDING') outboxPending = Number(oc.cnt);
      else if (oc.status === 'SYNCED') outboxSynced = Number(oc.cnt);
      else if (oc.status === 'FAILED') outboxFailed = Number(oc.cnt);
    }

    let dbSizeBytes = 0;
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      dbSizeBytes = fs.statSync(this.dbPath).size;
    } else {
      const pageCount = Number(
        (this.db.prepare('PRAGMA page_count;').get() as { page_count: number }).page_count
      );
      const pageSize = Number(
        (this.db.prepare('PRAGMA page_size;').get() as { page_size: number }).page_size
      );
      dbSizeBytes = pageCount * pageSize;
    }

    const syncedTextBytesRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(LENGTH(text) * 2), 0) AS bytes
         FROM messages WHERE account_id = ? AND cloud_status = 'SYNCED'`
      )
      .get(accountId) as { bytes: number };

    const settings = this.getAllSettings();

    return {
      totalChats: chatsTotal,
      activeChats: chatsActive,
      totalMessages: msgTotal,
      importantMessages: msgImp,
      totalLinks: linksTotal,
      totalTags: tagsTotal,
      totalUsers: usersTotal,
      dbSizeBytes,
      ftsRowCount: ftsRows,
      outboxPending,
      outboxSynced,
      outboxFailed,
      cloudProvider: settings.cloud_provider || 'cloudflare_d1',
      cloudWorkerPaused: settings.cloud_worker_paused === 'true',
      d1EstimatedStorageBytes: Number(syncedTextBytesRow.bytes) + outboxSynced * 256,
      d1QuotaLimitBytes: 500 * 1024 * 1024, // Cloudflare D1 Free Tier 500 MB
      lastBackupAt: settings.last_backup_at || null,
    };
  }

  public exportMessagesCsv(filters: SearchFilters): string {
    const all = this.searchMessages({ ...filters, page: 1, pageSize: 1000 }).items;
    const headers = [
      'chat_id',
      'chat_title',
      'message_id',
      'sender_id',
      'sender_name',
      'date',
      'is_important',
      'cloud_status',
      'has_media',
      'tags',
      'links',
      'personal_note',
      'text',
    ];

    const escapeCsv = (val: unknown): string => {
      const str = val === null || val === undefined ? '' : String(val);
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [headers.join(',')];
    for (const m of all) {
      lines.push(
        [
          m.chatId,
          m.chatTitle,
          m.messageId,
          m.senderId ?? '',
          m.senderName,
          m.date,
          m.isImportant ? '1' : '0',
          m.cloudStatus,
          m.hasMedia ? '1' : '0',
          m.tags.join(';'),
          m.links.map((l) => l.url).join(';'),
          m.personalNote ?? '',
          m.text,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    // Prepend UTF-8 BOM for proper Persian rendering in Excel / LibreOffice
    return `\uFEFF${lines.join('\n')}`;
  }

  public close(): void {
    this.db.close();
  }
}
