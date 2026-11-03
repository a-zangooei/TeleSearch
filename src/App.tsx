import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Database,
  FileCode2,
  Layers,
  Play,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { parsePytestOutput, parseSqlSchemaTables } from './foundationUtils';

interface HealthPayload {
  healthy: boolean;
  database_path: string;
  sqlite_version: string | null;
  foreign_keys_enabled: boolean;
  tables: string[];
  missing_tables: string[];
  applied_migrations: string[];
}

interface PythonStatus {
  python_version: string;
  app_env: string;
  log_level: string;
  database_exists: boolean;
  health: HealthPayload;
}

interface FoundationStatusResponse {
  milestone: string;
  pythonVersionPin: string;
  pyprojectToml: string;
  schemaSql: string;
  pythonStatus: PythonStatus;
  docs: Record<string, string>;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type ActiveTab = 'overview' | 'schema' | 'docs';
type DocKey = 'readme' | 'architecture' | 'database' | 'development';

const DOC_LABELS: Array<{ key: DocKey; label: string; path: string }> = [
  { key: 'readme', label: 'README.md', path: 'README.md' },
  { key: 'architecture', label: 'ARCHITECTURE.md', path: 'docs/ARCHITECTURE.md' },
  { key: 'database', label: 'DATABASE.md', path: 'docs/DATABASE.md' },
  { key: 'development', label: 'DEVELOPMENT.md', path: 'docs/DEVELOPMENT.md' },
];

export default function App() {
  const [data, setData] = useState<FoundationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedDoc, setSelectedDoc] = useState<DocKey>('architecture');
  const [runningInit, setRunningInit] = useState(false);
  const [runningVerify, setRunningVerify] = useState(false);
  const [cliOutput, setCliOutput] = useState<{
    title: string;
    exitCode: number;
    output: string;
    summary?: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/foundation/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load foundation status`);
      }
      const json = (await response.json()) as FoundationStatusResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const parsedTables = useMemo(
    () => (data ? parseSqlSchemaTables(data.schemaSql) : []),
    [data]
  );

  const handleRunEntrypoint = async () => {
    setRunningInit(true);
    try {
      const response = await fetch('/api/foundation/init', { method: 'POST' });
      const payload = (await response.json()) as CommandResult & { pythonStatus: PythonStatus };
      setData((prev) => (prev ? { ...prev, pythonStatus: payload.pythonStatus } : prev));
      setCliOutput({
        title: 'python -m app.main',
        exitCode: payload.exitCode,
        output: [payload.stdout, payload.stderr].filter(Boolean).join('\n').trim(),
        summary:
          payload.exitCode === 0
            ? 'Offline entrypoint initialized SQLite and passed health check (exit 0).'
            : 'Entrypoint exited with non-zero status.',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningInit(false);
    }
  };

  const handleRunVerification = async () => {
    setRunningVerify(true);
    try {
      const response = await fetch('/api/foundation/verify', { method: 'POST' });
      const payload = (await response.json()) as {
        pytest: CommandResult;
        ruff: CommandResult;
      };
      const pytestParsed = parsePytestOutput(payload.pytest.stdout, payload.pytest.exitCode);
      const combinedExit = payload.pytest.exitCode === 0 && payload.ruff.exitCode === 0 ? 0 : 1;
      setCliOutput({
        title: 'pytest -v && ruff check .',
        exitCode: combinedExit,
        summary: `Pytest: ${pytestParsed.passed} passed, ${pytestParsed.failed} failed | Ruff: ${
          payload.ruff.exitCode === 0 ? 'All checks passed' : 'Issues detected'
        }`,
        output: [
          '=== Ruff Check ===',
          payload.ruff.stdout || 'All checks passed!',
          payload.ruff.stderr,
          '',
          '=== Pytest Suite ===',
          payload.pytest.stdout,
          payload.pytest.stderr,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningVerify(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">
          Loading Telegram Knowledge Engine — Milestone 0 Foundation...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-rose-200 rounded-lg p-6 shadow-xs">
          <h1 className="text-base font-semibold text-rose-700">Foundation Status Error</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'Unable to load status.'}</p>
          <button
            type="button"
            onClick={() => void fetchStatus()}
            className="mt-4 px-3.5 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { pythonStatus } = data;
  const { health } = pythonStatus;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-slate-900 text-white flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                  Telegram Knowledge Engine
                </h1>
                <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded">
                  Milestone 0 Foundation
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Local-first, text-only Python 3.13 archive foundation — SQLite + pure domain models
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleRunVerification()}
              disabled={runningVerify}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {runningVerify ? 'Running Pytest & Ruff...' : 'Run Pytest & Ruff'}
            </button>
            <button
              type="button"
              onClick={() => void handleRunEntrypoint()}
              disabled={runningInit}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {runningInit ? 'Initializing...' : 'Run Foundation Health Check'}
            </button>
          </div>
        </div>

        <nav
          aria-label="Foundation Inspector Tabs"
          className="max-w-6xl mx-auto px-6 flex items-center gap-6 border-t border-slate-100"
        >
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Runtime & Architecture
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'schema'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            SQL Schema (001_initial_schema.sql)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'docs'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Documentation
          </button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {cliOutput && (
          <section
            aria-label="CLI Execution Result"
            className="bg-slate-900 text-slate-100 rounded-lg border border-slate-800 overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs text-sky-400">$ {cliOutput.title}</span>
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                    cliOutput.exitCode === 0
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  exit {cliOutput.exitCode}
                </span>
              </div>
              {cliOutput.summary && (
                <span className="text-xs text-slate-300">{cliOutput.summary}</span>
              )}
            </div>
            <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-72 leading-relaxed">
              {cliOutput.output}
            </pre>
          </section>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Python Runtime</div>
                <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-slate-900">
                  {pythonStatus.python_version}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Target pin: <code className="font-mono">{data.pythonVersionPin}</code>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">SQLite Health</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <CheckCircle2
                    className={`w-5 h-5 ${
                      health.healthy ? 'text-emerald-600' : 'text-amber-500'
                    }`}
                  />
                  <span className="text-lg font-semibold text-slate-900">
                    {health.healthy ? 'Healthy' : 'Uninitialized'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono truncate">
                  {health.database_path}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Foreign Keys & Engine</div>
                <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-slate-900">
                  {health.foreign_keys_enabled ? 'PRAGMA FK = ON' : 'Pending Init'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  SQLite {health.sqlite_version || 'stdlib sqlite3'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500">Applied Migrations</div>
                <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-slate-900">
                  {health.applied_migrations.length}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono truncate">
                  {health.applied_migrations[0] || 'Run app.main to initialize'}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-600" />
                  Milestone 0 Schema Tables ({parsedTables.length})
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Strictly text-only metadata & archive tables. Zero media blobs, zero premature FTS5.
                </p>
                <div className="mt-4 divide-y divide-slate-100">
                  {parsedTables.map((table) => (
                    <div key={table.name} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {table.name}
                        </span>
                        <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {table.primaryKey}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-slate-500 font-mono leading-relaxed">
                        {table.columns.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-slate-600" />
                  pyproject.toml
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Python 3.13+ package manifest managed via uv or standard venv + pip.
                </p>
                <pre className="mt-4 p-3.5 bg-slate-950 text-slate-200 rounded-md text-xs font-mono overflow-x-auto max-h-80 leading-relaxed">
                  {data.pyprojectToml}
                </pre>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'schema' && (
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  app/database/migrations/001_initial_schema.sql
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Executed atomically inside BEGIN IMMEDIATE ... COMMIT and recorded in schema_migrations.
                </p>
              </div>
            </div>
            <pre className="p-4 bg-slate-950 text-slate-100 rounded-md text-xs font-mono overflow-x-auto leading-relaxed">
              {data.schemaSql}
            </pre>
          </section>
        )}

        {activeTab === 'docs' && (
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 flex flex-wrap items-center gap-2">
              {DOC_LABELS.map((doc) => (
                <button
                  key={doc.key}
                  type="button"
                  onClick={() => setSelectedDoc(doc.key)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                    selectedDoc === doc.key
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {doc.path}
                </button>
              ))}
            </div>
            <pre className="p-5 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {data.docs[selectedDoc]}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}
