import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  buildFtsQuery,
  buildIndexableNormalizedText,
  normalizePersianText,
} from './src/core/normalization';
import { SearchMode, SyncPolicy } from './src/core/types';
import { ArchiveEngine } from './src/server/archiveEngine';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '25mb' }));

  const engine = new ArchiveEngine();

  // --- Health & System Overview ---
  app.get('/api/overview', (_req, res) => {
    try {
      res.json({
        stats: engine.getStats(),
        chats: engine.listChats(),
        tags: engine.listTags(),
        users: engine.listUsers(),
        settings: engine.getAllSettings(),
        integrity: engine.checkIntegrity(),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Search Messages (SQLite FTS5 + Persian Normalizer) ---
  app.get('/api/search', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const mode =
        req.query.mode === SearchMode.EXACT ? SearchMode.EXACT : SearchMode.FLEXIBLE;
      const chatId = req.query.chatId ? Number(req.query.chatId) : undefined;
      const senderId = req.query.senderId ? Number(req.query.senderId) : undefined;
      const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
      const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
      const onlyImportant = req.query.onlyImportant === 'true';
      const hasLink = req.query.hasLink === 'true';
      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 15;

      const result = engine.searchMessages({
        q,
        mode,
        chatId,
        senderId,
        dateFrom,
        dateTo,
        tag,
        onlyImportant,
        hasLink,
        page,
        pageSize,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Message Detail & Reply Chain ---
  app.get('/api/messages/:chatId/:messageId', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const detail = engine.getMessageDetail(chatId, messageId);
      if (!detail) {
        res.status(404).json({ error: 'پیام یافت نشد.' });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Knowledge Actions: Important, Tags, Personal Notes, Manual Sync ---
  app.post('/api/messages/:chatId/:messageId/important', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const isImportant = Boolean(req.body?.isImportant);
      const message = engine.toggleImportant(chatId, messageId, isImportant);
      res.json({ message, stats: engine.getStats() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/messages/:chatId/:messageId/tags', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const tag = String(req.body?.tag || '');
      const message = engine.addTagToMessage(chatId, messageId, tag);
      res.json({ message, tags: engine.listTags() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/messages/:chatId/:messageId/tags/:tagName', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const tagName = decodeURIComponent(req.params.tagName);
      const message = engine.removeTagFromMessage(chatId, messageId, tagName);
      res.json({ message, tags: engine.listTags() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put('/api/messages/:chatId/:messageId/note', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const noteText = String(req.body?.noteText ?? '');
      const message = engine.savePersonalNote(chatId, messageId, noteText);
      res.json({ message });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/messages/:chatId/:messageId/queue-sync', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const messageId = Number(req.params.messageId);
      const message = engine.enqueueManualSync(chatId, messageId);
      res.json({ message, stats: engine.getStats() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Chats, Sync Policies & Checkpoint Import ---
  app.get('/api/chats', (_req, res) => {
    res.json({ chats: engine.listChats() });
  });

  app.patch('/api/chats/:chatId', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const result = engine.updateChatConfig(chatId, {
        isActive: req.body?.isActive,
        syncPolicy: req.body?.syncPolicy,
        customRule: req.body?.customRule,
      });
      res.json({
        ...result,
        chats: engine.listChats(),
        stats: engine.getStats(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/chats/:chatId/import-batch', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const batchSize = Number(req.body?.batchSize || 2);
      const result = engine.runCheckpointImportBatch(chatId, batchSize);
      res.json({
        ...result,
        chats: engine.listChats(),
        stats: engine.getStats(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/chats/:chatId/import-pause', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const paused = Boolean(req.body?.paused);
      const chat = engine.setImportPauseState(chatId, paused);
      res.json({ chat, chats: engine.listChats() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/import/telegram-json', (req, res) => {
    try {
      const rawJson = String(req.body?.rawJson || '');
      const syncPolicy = (req.body?.syncPolicy as SyncPolicy) || SyncPolicy.LOCAL_ONLY;
      if (!rawJson.trim()) {
        res.status(400).json({ error: 'محتوای فایل JSON خالی است.' });
        return;
      }
      const result = engine.importTelegramJsonExport(rawJson, syncPolicy);
      res.json({
        ...result,
        chats: engine.listChats(),
        stats: engine.getStats(),
        tags: engine.listTags(),
        users: engine.listUsers(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Knowledge Repository: Links & Exports ---
  app.get('/api/knowledge/links', (_req, res) => {
    res.json({ links: engine.listLinks(150) });
  });

  app.get('/api/export/json', (req, res) => {
    const onlyImportant = req.query.onlyImportant === 'true';
    const chatId = req.query.chatId ? Number(req.query.chatId) : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const data = engine.searchMessages({
      onlyImportant,
      chatId,
      tag,
      page: 1,
      pageSize: 1000,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="telegram-knowledge-archive.json"'
    );
    res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          format: 'telegram-knowledge-engine-v1',
          mediaIncluded: false,
          count: data.items.length,
          messages: data.items,
        },
        null,
        2
      )
    );
  });

  app.get('/api/export/csv', (req, res) => {
    const onlyImportant = req.query.onlyImportant === 'true';
    const chatId = req.query.chatId ? Number(req.query.chatId) : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const csv = engine.exportMessagesCsv({ onlyImportant, chatId, tag });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="telegram-knowledge-archive.csv"'
    );
    res.send(csv);
  });

  // --- Cloud Sync Outbox Engine ---
  app.get('/api/sync/outbox', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    res.json({
      outbox: engine.listOutbox(status),
      history: engine.listSyncHistory(),
      stats: engine.getStats(),
    });
  });

  app.post('/api/sync/process', (req, res) => {
    try {
      const batchSize = Number(req.body?.batchSize || 25);
      const result = engine.processOutboxBatch(batchSize);
      res.json({
        ...result,
        outbox: engine.listOutbox('ALL'),
        history: engine.listSyncHistory(),
        stats: engine.getStats(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Settings, Persian Normalizer Lab, Backups & Milestone 0 Foundation ---
  app.put('/api/settings', (req, res) => {
    try {
      const updates = (req.body || {}) as Record<string, string>;
      const settings = engine.updateSettings(updates);
      res.json({ settings, stats: engine.getStats() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/normalize-preview', (req, res) => {
    const sampleText = String(req.body?.text || '');
    const sampleQuery = String(req.body?.query || '');
    const options = engine.getNormalizationOptions();
    const normalized = normalizePersianText(sampleText, options);
    const indexable = buildIndexableNormalizedText(sampleText, options);
    const ftsFlexible = buildFtsQuery(sampleQuery, SearchMode.FLEXIBLE, options);
    const ftsExact = buildFtsQuery(sampleQuery, SearchMode.EXACT, options);

    res.json({
      normalized,
      indexable,
      ftsFlexible,
      ftsExact,
    });
  });

  app.post('/api/maintenance/rebuild-fts', (_req, res) => {
    try {
      const result = engine.rebuildFtsIndex();
      res.json({ ...result, stats: engine.getStats(), integrity: engine.checkIntegrity() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/maintenance/backups', (_req, res) => {
    res.json({
      backups: engine.listBackups(),
      integrity: engine.checkIntegrity(),
    });
  });

  app.post('/api/maintenance/backups', (_req, res) => {
    try {
      const backup = engine.createAtomicBackup();
      res.json({
        backup,
        backups: engine.listBackups(),
        stats: engine.getStats(),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/foundation/files', (_req, res) => {
    const readSafe = (relPath: string) => {
      const full = path.resolve(process.cwd(), relPath);
      return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : '';
    };
    res.json({
      files: [
        {
          name: 'pyproject.toml',
          path: 'pyproject.toml',
          language: 'toml',
          description: 'پیکربندی محیط Python 3.13/3.14، وابستگی‌های Telethon، FastAPI، Pydantic، pytest و Ruff',
          content: readSafe('pyproject.toml'),
        },
        {
          name: 'collector/telegram_collector.py',
          path: 'collector/telegram_collector.py',
          language: 'python',
          description: 'ماژول دریافت تاریخچه متنی تلگرام (Telethon Async) با مدیریت Checkpoint، FloodWait و بدون دانلود رسانه',
          content: readSafe('collector/telegram_collector.py'),
        },
        {
          name: 'ARCHITECTURE.md',
          path: 'ARCHITECTURE.md',
          language: 'markdown',
          description: 'مستند معماری چهارلایه، طرحواره SQLite + FTS5 و مرزهای امنیتی پروژه',
          content: readSafe('ARCHITECTURE.md'),
        },
        {
          name: 'ROADMAP.md',
          path: 'ROADMAP.md',
          language: 'markdown',
          description: 'نقشه راه اجرایی از Milestone 0 تا نسخه پایدار 1.0 و معیارهای پذیرش هر فاز',
          content: readSafe('ROADMAP.md'),
        },
      ],
    });
  });

  // --- Vite Middleware (Dev) or Static Dist (Prod) ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Knowledge Engine running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
