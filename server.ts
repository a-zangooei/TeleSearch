import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import { createServer as createViteServer } from 'vite';

const execFileAsync = promisify(execFile);
const ROOT_DIR = process.cwd();

const DOC_FILES: Record<string, string> = {
  readme: 'README.md',
  architecture: 'docs/ARCHITECTURE.md',
  database: 'docs/DATABASE.md',
  development: 'docs/DEVELOPMENT.md',
};

function resolveUvBinary(): string {
  const candidates = ['/usr/local/bin/uv', path.join(process.env.HOME || '', '.local/bin/uv'), 'uv'];
  for (const candidate of candidates) {
    if (candidate === 'uv' || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'uv';
}

async function runCommandCapture(
  cmd: string,
  args: string[],
  timeoutMs = 30000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: ROOT_DIR,
      timeout: timeoutMs,
      env: { ...process.env },
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
      stdout: execErr.stdout || '',
      stderr: execErr.stderr || execErr.message || '',
    };
  }
}

async function inspectPythonHealth() {
  const uvBin = resolveUvBinary();
  const snippet = [
    'import json, platform, sys',
    'from pathlib import Path',
    'from app.core.config import load_config',
    'from app.database.sqlite import SQLiteDatabase',
    'cfg = load_config()',
    'db_exists = cfg.database_path.is_file()',
    'health = SQLiteDatabase(cfg.database_path).health_check() if db_exists else {',
    '  "healthy": False,',
    '  "database_path": str(cfg.database_path),',
    '  "sqlite_version": None,',
    '  "foreign_keys_enabled": False,',
    '  "tables": [],',
    '  "missing_tables": ["chats", "messages", "schema_migrations", "sync_state", "users"],',
    '  "applied_migrations": []',
    '}',
    'print(json.dumps({',
    '  "python_version": platform.python_version(),',
    '  "app_env": cfg.app_env,',
    '  "log_level": cfg.app_log_level,',
    '  "database_exists": db_exists,',
    '  "health": health',
    '}))',
  ].join('\n');

  const res = await runCommandCapture(uvBin, ['run', '--no-sync', 'python', '-c', snippet], 15000);
  if (res.exitCode === 0 && res.stdout.trim()) {
    try {
      return JSON.parse(res.stdout.trim());
    } catch {
      // Fall through to fallback status
    }
  }
  return {
    python_version: '3.13 (pending uv sync)',
    app_env: 'development',
    log_level: 'INFO',
    database_exists: fs.existsSync(path.join(ROOT_DIR, 'data/database/telegram_archive.db')),
    health: {
      healthy: false,
      database_path: 'data/database/telegram_archive.db',
      sqlite_version: null,
      foreign_keys_enabled: false,
      tables: [],
      missing_tables: ['chats', 'messages', 'schema_migrations', 'sync_state', 'users'],
      applied_migrations: [],
    },
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  app.get('/api/foundation/status', async (_req, res) => {
    try {
      const schemaSql = fs.readFileSync(
        path.join(ROOT_DIR, 'app/database/migrations/001_initial_schema.sql'),
        'utf-8'
      );
      const pyprojectToml = fs.readFileSync(path.join(ROOT_DIR, 'pyproject.toml'), 'utf-8');
      const pythonVersionPin = fs
        .readFileSync(path.join(ROOT_DIR, '.python-version'), 'utf-8')
        .trim();
      const pythonStatus = await inspectPythonHealth();

      const docs: Record<string, string> = {};
      for (const [key, relPath] of Object.entries(DOC_FILES)) {
        const fullPath = path.join(ROOT_DIR, relPath);
        docs[key] = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
      }

      res.json({
        milestone: 'Milestone 0 — Project Foundation',
        pythonVersionPin,
        pyprojectToml,
        schemaSql,
        pythonStatus,
        docs,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/foundation/init', async (_req, res) => {
    const uvBin = resolveUvBinary();
    const runResult = await runCommandCapture(
      uvBin,
      ['run', '--no-sync', 'python', '-m', 'app.main'],
      20000
    );
    const pythonStatus = await inspectPythonHealth();
    res.json({
      ...runResult,
      pythonStatus,
    });
  });

  app.post('/api/foundation/verify', async (_req, res) => {
    const uvBin = resolveUvBinary();
    const pytestRes = await runCommandCapture(uvBin, ['run', '--no-sync', 'pytest', '-v'], 30000);
    const ruffRes = await runCommandCapture(uvBin, ['run', '--no-sync', 'ruff', 'check', '.'], 15000);
    res.json({
      pytest: pytestRes,
      ruff: ruffRes,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TKE Milestone 0 Foundation host listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
