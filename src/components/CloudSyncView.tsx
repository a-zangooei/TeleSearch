import React, { useEffect, useState } from 'react';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { OutboxRecord, SyncHistoryEntry, SystemStats } from '../core/types';
import { formatBytes, formatJalaliOrIsoDate } from '../utils/format';

interface CloudSyncViewProps {
  stats: SystemStats;
  settings: Record<string, string>;
  onStatsAndSettingsUpdated: (stats: SystemStats, settings?: Record<string, string>) => void;
}

export const CloudSyncView: React.FC<CloudSyncViewProps> = ({
  stats,
  settings,
  onStatsAndSettingsUpdated,
}) => {
  const [outbox, setOutbox] = useState<OutboxRecord[]>([]);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [processing, setProcessing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOutbox = async (filter = statusFilter) => {
    try {
      const res = await api.getOutbox(filter);
      setOutbox(res.outbox);
      setHistory(res.history);
      onStatsAndSettingsUpdated(res.stats);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadOutbox(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const isWorkerPaused = settings.cloud_worker_paused === 'true';
  const currentProvider = settings.cloud_provider || 'cloudflare_d1';

  const handleToggleWorkerPause = async () => {
    setError(null);
    try {
      const nextVal = isWorkerPaused ? 'false' : 'true';
      const res = await api.updateSettings({ cloud_worker_paused: nextVal });
      onStatsAndSettingsUpdated(res.stats, res.settings);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleProviderChange = async (provider: string) => {
    setError(null);
    try {
      const res = await api.updateSettings({ cloud_provider: provider });
      onStatsAndSettingsUpdated(res.stats, res.settings);
      setBanner(`آداپتور مقصد همگام‌سازی ابری به «${provider}» تغییر یافت (هسته جست‌وجو بدون وابستگی باقی ماند).`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleProcessNow = async () => {
    setProcessing(true);
    setError(null);
    setBanner(null);
    try {
      const res = await api.processOutbox(50);
      setOutbox(res.outbox);
      setHistory(res.history);
      onStatsAndSettingsUpdated(res.stats);
      setBanner(
        res.syncedCount > 0
          ? `${res.syncedCount} عملیات از صف Outbox با کلید یکتای Idempotency به ${res.provider} منتقل شد.`
          : 'هیچ عملیات در انتظاری در صف Outbox وجود ندارد.'
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const quotaPct = Math.min(
    100,
    Math.max(0.1, (stats.d1EstimatedStorageBytes / stats.d1QuotaLimitBytes) * 100)
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">
            موتور همگام‌سازی ابری و صف انتقال (Outbox Pattern)
          </h2>
          <p className="text-xs text-slate-500">
            عملیات انتقال مستقل از دریافت تلگرام در جدول sync_outbox ثبت می‌شوند تا قطعی اینترنت یا تغییر ارائه‌دهنده کلود هیچ خطایی در آرشیو لوکال ایجاد نکند.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleWorkerPause}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {isWorkerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isWorkerPaused ? 'ادامه کار صف انتقال' : 'توقف موقت انتقال'}
          </button>

          <button
            type="button"
            disabled={processing || isWorkerPaused}
            onClick={handleProcessNow}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-45 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${processing ? 'animate-spin' : ''}`} />
            {processing ? 'در حال ارسال...' : 'پردازش فوری صف Outbox'}
          </button>
        </div>
      </div>

      {banner && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {banner}
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 4-Column Flat KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-200">
        <div className="p-4 space-y-1">
          <div className="text-xs text-slate-500">پیام‌های منتقل‌شده (SYNCED)</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.outboxSynced}
          </div>
          <div className="text-[11px] text-slate-400">با کلید یکتای Idempotency</div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-xs text-slate-500">در صف انتظار انتقال (PENDING)</div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {stats.outboxPending}
          </div>
          <div className="text-[11px] text-slate-400">آماده ارسال در دسته بعدی</div>
        </div>

        <div className="p-4 space-y-1">
          <div className="text-xs text-slate-500">خطاهای انتقال (FAILED)</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.outboxFailed}
          </div>
          <div className="text-[11px] text-slate-400">قابلیت تلاش مجدد خودکار</div>
        </div>

        <div className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>مصرف تخمینی Cloudflare D1</span>
            <span className="font-mono tabular-nums text-slate-800">
              {formatBytes(stats.d1EstimatedStorageBytes)} / 500 MB
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-600" style={{ width: `${Math.max(2, quotaPct)}%` }} />
          </div>
          <div className="text-[11px] text-slate-400">سهمیه رایگان D1 کاملاً ایمن است</div>
        </div>
      </div>

      {/* Provider Adapter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-xs font-semibold text-slate-900">
            انتخاب آداپتور مقصد (قرارداد مستقل CloudStorageProvider)
          </div>
          <div className="text-xs text-slate-500">
            تغییر زیرساخت ابری فقط آداپتور مقصد را عوض می‌کند و کد جست‌وجو یا دیتابیس لوکال دست‌نخورده می‌ماند.
          </div>
        </div>

        <div className="inline-flex items-center p-1 bg-slate-100 rounded-md shrink-0">
          <button
            type="button"
            onClick={() => handleProviderChange('cloudflare_d1')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              currentProvider === 'cloudflare_d1'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cloudflare Workers + D1
          </button>
          <button
            type="button"
            onClick={() => handleProviderChange('self_hosted_vps')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              currentProvider === 'self_hosted_vps'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Self-Hosted VPS
          </button>
        </div>
      </div>

      {/* Outbox Queue Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-semibold text-slate-900">
            فهرست عملیات صف انتقال (sync_outbox)
          </h3>
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-md">
            {(['ALL', 'PENDING', 'SYNCED', 'FAILED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL'
                  ? 'همه وضعیت‌ها'
                  : st === 'PENDING'
                  ? 'در انتظار'
                  : st === 'SYNCED'
                  ? 'منتقل‌شده'
                  : 'خطادار'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="px-4 py-2.5">کلید یکتای Idempotency</th>
                <th className="px-4 py-2.5">گفتگو</th>
                <th className="px-4 py-2.5">پیام</th>
                <th className="px-4 py-2.5">عملیات</th>
                <th className="px-4 py-2.5">وضعیت</th>
                <th className="px-4 py-2.5">آخرین به‌روزرسانی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {outbox.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    هیچ رکوردی با این فیلتر در صف Outbox وجود ندارد.
                  </td>
                </tr>
              ) : (
                outbox.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-700" dir="ltr">
                      {item.idempotencyKey}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{item.chatTitle}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                      #{item.messageId}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{item.operation}</td>
                    <td className="px-4 py-3 font-medium">
                      {item.status === 'SYNCED' && (
                        <span className="text-emerald-700">منتقل‌شده (SYNCED)</span>
                      )}
                      {item.status === 'PENDING' && (
                        <span className="text-amber-700">در انتظار (PENDING)</span>
                      )}
                      {item.status === 'FAILED' && (
                        <span className="text-red-700">خطا (FAILED)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                      {formatJalaliOrIsoDate(item.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync Execution History */}
      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-xs font-semibold text-slate-900">سابقه دسته‌های انتقال (sync_history)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="px-4 py-2.5">شناسه نوبت</th>
                  <th className="px-4 py-2.5">ارائه‌دهنده مقصد</th>
                  <th className="px-4 py-2.5">تعداد پیام موفق</th>
                  <th className="px-4 py-2.5">مدت زمان</th>
                  <th className="px-4 py-2.5">تاریخ ثبت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">#{h.id}</td>
                    <td className="px-4 py-2.5 text-slate-800">{h.provider}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-emerald-700 font-semibold">
                      {h.syncedCount}
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">
                      {h.durationMs} ms
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-500">
                      {formatJalaliOrIsoDate(h.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
