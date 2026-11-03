import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Download,
  ExternalLink,
  Hash,
  Link2,
} from 'lucide-react';
import { api } from '../api/client';
import { MessageRecord, SystemStats } from '../core/types';
import { cloudStatusLabel, formatJalaliOrIsoDate } from '../utils/format';
import { BdiProseText } from './BdiProseText';

interface KnowledgeHubViewProps {
  tags: Array<{ id: number; name: string; messageCount: number }>;
  stats: SystemStats;
}

type KnowledgeTab = 'important' | 'tags' | 'links';

export const KnowledgeHubView: React.FC<KnowledgeHubViewProps> = ({ tags, stats }) => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('important');
  const [importantMessages, setImportantMessages] = useState<MessageRecord[]>([]);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('');
  const [tagMessages, setTagMessages] = useState<MessageRecord[]>([]);
  const [links, setLinks] = useState<
    Array<{
      url: string;
      domain: string;
      chatId: number;
      chatTitle: string;
      messageId: number;
      date: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (activeTab === 'important') {
      api
        .search({ onlyImportant: true, page: 1, pageSize: 50 })
        .then((res) => {
          if (active) setImportantMessages(res.items);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (activeTab === 'links') {
      api
        .getLinks()
        .then((res) => {
          if (active) setLinks(res.links);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (activeTab === 'tags') {
      const targetTag = selectedTagFilter || tags[0]?.name || '';
      if (targetTag) {
        setSelectedTagFilter(targetTag);
        api
          .search({ tag: targetTag, page: 1, pageSize: 50 })
          .then((res) => {
            if (active) setTagMessages(res.items);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    }
    return () => {
      active = false;
    };
  }, [activeTab, selectedTagFilter, tags]);

  const handleDownloadExport = async (format: 'json' | 'csv', onlyImportant: boolean) => {
    setExportStatus('در حال آماده‌سازی فایل خروجی...');
    try {
      const url = `/api/export/${format}?onlyImportant=${onlyImportant ? 'true' : 'false'}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = onlyImportant
        ? `telegram-important-messages.${format}`
        : `telegram-full-archive.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      setExportStatus(
        `فایل ${format.toUpperCase()} با موفقیت ساخته و دانلود شد.`
      );
      setTimeout(() => setExportStatus(null), 3000);
    } catch {
      setExportStatus('خطا در ساخت فایل خروجی.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Portable Exports */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">
            مدیریت دانش: پیام‌های مهم، برچسب‌ها و خروجی قابل‌انتقال
          </h2>
          <p className="text-xs text-slate-500">
            مجموع {stats.importantMessages} پیام مهم · {stats.totalTags} برچسب فعال · {stats.totalLinks} لینک استخراج‌شده
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleDownloadExport('json', false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            خروجی کامل JSON
          </button>
          <button
            type="button"
            onClick={() => handleDownloadExport('csv', false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            خروجی کامل CSV
          </button>
          <button
            type="button"
            onClick={() => handleDownloadExport('json', true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Bookmark className="w-3.5 h-3.5" />
            خروجی فقط مهم‌ها (JSON)
          </button>
        </div>
      </div>

      {exportStatus && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-md text-xs text-sky-900">
          {exportStatus}
        </div>
      )}

      {/* Segmented Navigation */}
      <div className="inline-flex items-center p-1 bg-slate-200/70 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveTab('important')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'important'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          پیام‌های مهم ({stats.importantMessages})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tags')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'tags'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          دسته‌بندی برچسب‌ها ({stats.totalTags})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('links')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'links'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          مخزن لینک‌ها ({stats.totalLinks})
        </button>
      </div>

      {loading && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div className="h-4 bg-slate-100 rounded w-1/3 animate-pulse" />
          <div className="h-16 bg-slate-100 rounded w-full animate-pulse" />
        </div>
      )}

      {/* Important Messages Tab */}
      {!loading && activeTab === 'important' && (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          {importantMessages.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              هنوز پیامی به‌عنوان مهم علامت‌گذاری نشده است.
            </div>
          ) : (
            importantMessages.map((m) => (
              <div key={`${m.chatId}:${m.messageId}`} className="p-5 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-900">{m.chatTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span>{m.senderName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatJalaliOrIsoDate(m.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">#{m.messageId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{cloudStatusLabel(m.cloudStatus)}</span>
                </div>
                <p className="text-sm text-slate-800 leading-7">
                  <BdiProseText text={m.text} />
                </p>
                {m.personalNote && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">یادداشت شخصی: </span>
                    {m.personalNote}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tags Tab */}
      {!loading && activeTab === 'tags' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 h-fit">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTagFilter(t.name)}
                className={`w-full flex items-center justify-between px-4 py-3 text-xs transition-colors ${
                  selectedTagFilter === t.name
                    ? 'bg-sky-50 text-sky-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>#{t.name}</span>
                <span className="font-mono tabular-nums text-slate-500">{t.messageCount}</span>
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {tagMessages.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                پیامی با این برچسب یافت نشد.
              </div>
            ) : (
              tagMessages.map((m) => (
                <div key={`${m.chatId}:${m.messageId}`} className="p-5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{m.chatTitle}</span>
                    <span aria-hidden="true">·</span>
                    <span>{m.senderName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">#{m.messageId}</span>
                  </div>
                  <p className="text-sm text-slate-800 leading-7">
                    <BdiProseText text={m.text} />
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Extracted Links Tab */}
      {!loading && activeTab === 'links' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="px-4 py-3">دامنه</th>
                  <th className="px-4 py-3">آدرس کامل URL</th>
                  <th className="px-4 py-3">گفتگوی مبدأ</th>
                  <th className="px-4 py-3">شناسه پیام</th>
                  <th className="px-4 py-3">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {links.map((item, idx) => (
                  <tr key={`${item.url}-${idx}`} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-slate-700" dir="ltr">
                      {item.domain}
                    </td>
                    <td className="px-4 py-3 max-w-md truncate" dir="ltr">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-700 hover:underline font-mono"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.url}</span>
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{item.chatTitle}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                      #{item.messageId}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                      {formatJalaliOrIsoDate(item.date)}
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
