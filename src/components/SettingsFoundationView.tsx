import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { api, FoundationFile } from '../api/client';
import { DEFAULT_NORMALIZATION_OPTIONS } from '../core/normalization';
import { BackupFileEntry, NormalizationOptions, SystemStats } from '../core/types';
import { formatBytes, formatJalaliOrIsoDate } from '../utils/format';

interface SettingsFoundationViewProps {
  stats: SystemStats;
  settings: Record<string, string>;
  integrity: { ok: boolean; result: string };
  onUpdated: (stats: SystemStats, settings?: Record<string, string>) => void;
}

export const SettingsFoundationView: React.FC<SettingsFoundationViewProps> = ({
  stats,
  settings,
  integrity,
  onUpdated,
}) => {
  const [normOptions, setNormOptions] = useState<NormalizationOptions>(() => {
    try {
      return {
        ...DEFAULT_NORMALIZATION_OPTIONS,
        ...JSON.parse(settings.normalization_options || '{}'),
      };
    } catch {
      return DEFAULT_NORMALIZATION_OPTIONS;
    }
  });

  // Live Persian normalizer lab state
  const [labText, setLabText] = useState(
    'كِتابُ فيزيولوژي كليه: هر روز صبح به بخش بالینی می‌روم و یادداشت‌های نرم‌افزار را مرور می‌کنم.'
  );
  const [labQuery, setLabQuery] = useState('کتاب فیزیولوژی می روم');
  const [labOutput, setLabOutput] = useState<{
    normalized: string;
    indexable: string;
    ftsFlexible: string;
    ftsExact: string;
  } | null>(null);

  // Backups & maintenance
  const [backups, setBackups] = useState<BackupFileEntry[]>([]);
  const [dbIntegrity, setDbIntegrity] = useState(integrity);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Milestone 0 Foundation files
  const [foundationFiles, setFoundationFiles] = useState<FoundationFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    api.getBackups().then((res) => {
      setBackups(res.backups);
      setDbIntegrity(res.integrity);
    });
    api.getFoundationFiles().then((res) => {
      setFoundationFiles(res.files);
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.previewNormalization(labText, labQuery).then(setLabOutput);
    }, 120);
    return () => clearTimeout(timer);
  }, [labText, labQuery, settings.normalization_options]);

  const handleSaveNormOptions = async () => {
    setBusyAction('norm');
    setStatusMessage(null);
    try {
      const res = await api.updateSettings({
        normalization_options: JSON.stringify(normOptions),
      });
      onUpdated(res.stats, res.settings);
      const preview = await api.previewNormalization(labText, labQuery);
      setLabOutput(preview);
      setStatusMessage(
        'سیاست نرمال‌سازی فارسی ذخیره شد و ایندکس FTS5 روی کل پیام‌های آرشیو بازسازی گردید.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateBackup = async () => {
    setBusyAction('backup');
    setStatusMessage(null);
    try {
      const res = await api.createBackup();
      setBackups(res.backups);
      onUpdated(res.stats);
      setStatusMessage(
        `نسخه پشتیبان اتمی «${res.backup.filename}» با دستور VACUUM INTO ایجاد و سلامت آن (PRAGMA integrity_check = ok) تأیید شد.`
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleRebuildFts = async () => {
    setBusyAction('fts');
    setStatusMessage(null);
    try {
      const res = await api.rebuildFts();
      setDbIntegrity(res.integrity);
      onUpdated(res.stats);
      setStatusMessage(
        `ایندکس مجازی FTS5 برای ${res.indexedCount} پیام در مدت ${res.durationMs} میلی‌ثانیه بازسازی شد.`
      );
    } finally {
      setBusyAction(null);
    }
  };

  const activeFile = foundationFiles[selectedFileIdx] || null;

  const handleCopyFile = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore
    }
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name.split('/').pop() || activeFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900">
          تنظیمات هسته، پشتیبان‌گیری SQLite و فایل‌های Milestone 0
        </h2>
        <p className="text-xs text-slate-500">
          کنترل سلامت دیتابیس محلی، آزمایشگاه زنده نرمال‌سازی فارسی و دسترسی مستقیم به کدهای کالکتور پایتون (Telethon) و اسناد معماری.
        </p>
      </div>

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {statusMessage}
        </div>
      )}

      {/* 1. SQLite Health, Disk Metrics & Atomic Backup */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              ۰۱. سلامت پایگاه داده SQLite و پشتیبان‌گیری اتمی (VACUUM INTO)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              مسیر فایل محلی: <span className="font-mono">data/database/telegram_archive.db</span> · وضعیت سلامت:{' '}
              <span className="font-mono font-semibold text-emerald-700">
                {dbIntegrity.result}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleRebuildFts}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${busyAction === 'fts' ? 'animate-spin' : ''}`}
              />
              بازسازی ایندکس FTS5
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleCreateBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Database className="w-3.5 h-3.5" />
              {busyAction === 'backup'
                ? 'در حال پشتیبان‌گیری...'
                : 'ایجاد نسخه پشتیبان (VACUUM INTO)'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-500">حجم دیتابیس SQLite</div>
            <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5" dir="ltr">
              {formatBytes(stats.dbSizeBytes)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">رکوردهای ایندکس FTS5</div>
            <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
              <span className="font-mono">{stats.ftsRowCount}</span> ردیف
            </div>
          </div>
          <div>
            <div className="text-slate-500">فرستنده‌های یکتا (users)</div>
            <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
              <span className="font-mono">{stats.totalUsers}</span> کاربر
            </div>
          </div>
          <div>
            <div className="text-slate-500">آخرین پشتیبان‌گیری موفق</div>
            <div className="text-sm font-semibold text-slate-800 font-mono tabular-nums mt-0.5" dir="ltr">
              {formatJalaliOrIsoDate(stats.lastBackupAt)}
            </div>
          </div>
        </div>

        {backups.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              نسخه‌های پشتیبان ذخیره‌شده در data/backups/manual/ ({backups.length})
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span className="font-mono text-slate-800" dir="ltr">
                    {b.filename}
                  </span>
                  <div className="flex items-center gap-3 text-slate-500 font-mono tabular-nums">
                    <span>{formatBytes(b.sizeBytes)}</span>
                    <span>·</span>
                    <span>{formatJalaliOrIsoDate(b.createdAt)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-sans">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      سالم
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. Live Persian Normalization Lab */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              ۰۲. سیاست نرمال‌سازی زبان فارسی و آزمایشگاه زنده FTS5
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              متن اصلی پیام هرگز تغییر نمی‌کند؛ قواعد زیر فقط ستون normalized_text و عبارت جست‌وجو را همگام می‌کنند.
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleSaveNormOptions}
            className="px-3.5 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            ذخیره قواعد و بازسازی ایندکس
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={normOptions.arabicChars}
              onChange={(e) =>
                setNormOptions((o) => ({ ...o, arabicChars: e.target.checked }))
              }
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>تبدیل حروف عربی (ي/ك به ی/ک)</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={normOptions.stripDiacritics}
              onChange={(e) =>
                setNormOptions((o) => ({ ...o, stripDiacritics: e.target.checked }))
              }
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>حذف اعراب و نویسه کشیده (ـ)</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={normOptions.unifyHalfSpace}
              onChange={(e) =>
                setNormOptions((o) => ({ ...o, unifyHalfSpace: e.target.checked }))
              }
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>یکسان‌سازی نیم‌فاصله (می‌روم / می روم)</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={normOptions.normalizeDigits}
              onChange={(e) =>
                setNormOptions((o) => ({ ...o, normalizeDigits: e.target.checked }))
              }
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>یکسان‌سازی ارقام فارسی و عربی</span>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label htmlFor="lab-sample-text" className="block text-xs font-medium text-slate-700">
              متن آزمایشی ورودی (شامل حروف عربی، اعراب و نیم‌فاصله)
            </label>
            <textarea
              id="lab-sample-text"
              rows={2}
              value={labText}
              onChange={(e) => setLabText(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
            <label htmlFor="lab-sample-query" className="block text-xs font-medium text-slate-700">
              عبارت جست‌وجوی آزمایشی کاربر
            </label>
            <input
              id="lab-sample-query"
              type="text"
              value={labQuery}
              onChange={(e) => setLabQuery(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>

          {labOutput && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2.5 text-xs">
              <div>
                <div className="text-slate-500 mb-0.5">خروجی نرمال‌شده پایه (normalized_text):</div>
                <div className="font-medium text-slate-900">{labOutput.normalized}</div>
              </div>
              <div>
                <div className="text-slate-500 mb-0.5">کوئری کامپایل‌شده FTS5 (حالت انعطاف‌پذیر):</div>
                <div className="font-mono text-sky-800 break-all" dir="ltr">
                  {labOutput.ftsFlexible || '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 mb-0.5">کوئری کامپایل‌شده FTS5 (حالت دقیق کاراکتری):</div>
                <div className="font-mono text-slate-700 break-all" dir="ltr">
                  {labOutput.ftsExact || '—'}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Milestone 0 Foundation Deliverables Viewer */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              ۰۳. فایل‌های واقعی Milestone 0 و کالکتور پایتون (Telethon + pyproject.toml)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تکیه‌گاه کدنویسی محلی پایتون (نسخه 3.13 / 3.14) با حفظ کامل اطلاعات ورود تلگرام روی سیستم کاربر و سازگاری مستقیم با دیتابیس SQLite همین داشبورد.
            </p>
          </div>

          {activeFile && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedCode ? 'کپی شد' : 'کپی محتوا'}
              </button>
              <button
                type="button"
                onClick={handleDownloadFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                دانلود فایل
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
          {foundationFiles.map((file, idx) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedFileIdx(idx)}
              dir="ltr"
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedFileIdx === idx
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {file.name}
            </button>
          ))}
        </div>

        {activeFile && (
          <div>
            <div className="px-5 py-2.5 text-xs text-slate-600 bg-slate-50/40 border-b border-slate-100">
              {activeFile.description}
            </div>
            <pre
              dir="ltr"
              className="p-5 text-xs font-mono text-slate-800 bg-slate-50/30 overflow-x-auto max-h-[420px] leading-relaxed"
            >
              {activeFile.content}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};
