import React, { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  RotateCcw,
  Search,
} from 'lucide-react';
import { api } from '../api/client';
import {
  ChatRecord,
  MessageRecord,
  SearchMode,
  SearchResponse,
  SystemStats,
} from '../core/types';
import {
  chatTypeLabel,
  cloudStatusLabel,
  formatJalaliOrIsoDate,
} from '../utils/format';
import { BdiProseText } from './BdiProseText';
import { MessageDetailDrawer } from './MessageDetailDrawer';

interface SearchWorkspaceProps {
  chats: ChatRecord[];
  tags: Array<{ id: number; name: string; messageCount: number }>;
  users: Array<{ userId: number; displayName: string; username: string | null; messageCount: number }>;
  initialChatId?: number | null;
  onClearInitialChat?: () => void;
  onStatsUpdated: (stats: SystemStats) => void;
  onTagsUpdated: (tags: Array<{ id: number; name: string; messageCount: number }>) => void;
}

const QUICK_SAMPLE_QUERIES = [
  { label: 'فیزیولوژی کلیه (تطبیق عربی/فارسی)', query: 'فیزیولوژی کلیه' },
  { label: 'می‌روم (هر سه حالت نیم‌فاصله)', query: 'می‌روم' },
  { label: '"چرخه اوره" (عبارت دقیق)', query: '"چرخه اوره"' },
  { label: 'SQLite* (جست‌وجوی پیشوندی)', query: 'SQLite*' },
];

export const SearchWorkspace: React.FC<SearchWorkspaceProps> = ({
  chats,
  tags,
  users,
  initialChatId,
  onClearInitialChat,
  onStatsUpdated,
  onTagsUpdated,
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>(SearchMode.FLEXIBLE);
  const [selectedChatId, setSelectedChatId] = useState<string>(
    initialChatId ? String(initialChatId) : ''
  );
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [hasLink, setHasLink] = useState(false);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMessageKey, setActiveMessageKey] = useState<{
    chatId: number;
    messageId: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialChatId !== undefined && initialChatId !== null) {
      setSelectedChatId(String(initialChatId));
      setPage(1);
      onClearInitialChat?.();
    }
  }, [initialChatId, onClearInitialChat]);

  const executeSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.search({
        q: query,
        mode,
        chatId: selectedChatId ? Number(selectedChatId) : undefined,
        senderId: selectedSenderId ? Number(selectedSenderId) : undefined,
        tag: selectedTag || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        onlyImportant,
        hasLink,
        page,
        pageSize: 12,
      });
      setResults(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [
    query,
    mode,
    selectedChatId,
    selectedSenderId,
    selectedTag,
    dateFrom,
    dateTo,
    onlyImportant,
    hasLink,
    page,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      executeSearch();
    }, 140);
    return () => clearTimeout(timer);
  }, [executeSearch]);

  const handleResetFilters = () => {
    setQuery('');
    setMode(SearchMode.FLEXIBLE);
    setSelectedChatId('');
    setSelectedSenderId('');
    setSelectedTag('');
    setDateFrom('');
    setDateTo('');
    setOnlyImportant(false);
    setHasLink(false);
    setPage(1);
  };

  const handleRowCopy = async (e: React.MouseEvent, msg: MessageRecord) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(msg.text);
      const key = `${msg.chatId}:${msg.messageId}`;
      setCopiedId(key);
      setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  const handleRowBookmark = async (e: React.MouseEvent, msg: MessageRecord) => {
    e.stopPropagation();
    try {
      const res = await api.toggleImportant(msg.chatId, msg.messageId, !msg.isImportant);
      setResults((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.chatId === msg.chatId && item.messageId === msg.messageId
                  ? res.message
                  : item
              ),
            }
          : prev
      );
      onStatsUpdated(res.stats);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleMessageUpdatedInDrawer = (updated: MessageRecord, stats?: SystemStats) => {
    setResults((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.chatId === updated.chatId && item.messageId === updated.messageId
                ? updated
                : item
            ),
          }
        : prev
    );
    if (stats) onStatsUpdated(stats);
  };

  const totalPages = results ? Math.max(1, Math.ceil(results.total / results.pageSize)) : 1;

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)]">
      {/* Main Search Column */}
      <div className="flex-1 min-w-0 p-6 space-y-5">
        {/* Search Input & Mode Bar */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <label htmlFor="archive-search-input" className="sr-only">
                جست‌وجو در آرشیو پیام‌های تلگرام
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="archive-search-input"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder='جست‌وجو در متن پیام‌ها: مثلاً فیزیولوژی کلیه، "چرخه اوره" یا SQLite* ...'
                className="w-full pr-10 pl-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600 transition-colors"
              />
            </div>

            {/* Segmented Mode Control */}
            <div
              role="group"
              aria-label="حالت جست‌وجو"
              className="inline-flex items-center p-1 bg-slate-100 rounded-md shrink-0"
            >
              <button
                type="button"
                onClick={() => {
                  setMode(SearchMode.FLEXIBLE);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  mode === SearchMode.FLEXIBLE
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                انعطاف‌پذیر فارسی
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(SearchMode.EXACT);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  mode === SearchMode.EXACT
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                تطبیق دقیق کاراکتری
              </button>
            </div>
          </div>

          {/* Quick Sample Queries */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">نمونه کوئری‌های آماده:</span>
            {QUICK_SAMPLE_QUERIES.map((sq) => (
              <button
                key={sq.query}
                type="button"
                onClick={() => {
                  setQuery(sq.query);
                  setPage(1);
                }}
                className="px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
              >
                {sq.label}
              </button>
            ))}
          </div>

          {/* Structured Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label htmlFor="filter-chat" className="block text-xs text-slate-500 mb-1">
                گفتگو
              </label>
              <select
                id="filter-chat"
                value={selectedChatId}
                onChange={(e) => {
                  setSelectedChatId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="">همه گفتگوها</option>
                {chats.map((c) => (
                  <option key={c.chatId} value={c.chatId}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-sender" className="block text-xs text-slate-500 mb-1">
                فرستنده
              </label>
              <select
                id="filter-sender"
                value={selectedSenderId}
                onChange={(e) => {
                  setSelectedSenderId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="">همه فرستنده‌ها</option>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.displayName} ({u.messageCount})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-tag" className="block text-xs text-slate-500 mb-1">
                برچسب شخصی
              </label>
              <select
                id="filter-tag"
                value={selectedTag}
                onChange={(e) => {
                  setSelectedTag(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="">همه برچسب‌ها</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.name}>
                    #{t.name} ({t.messageCount})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-date-from" className="block text-xs text-slate-500 mb-1">
                از تاریخ میلادی
              </label>
              <input
                id="filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="filter-date-to" className="block text-xs text-slate-500 mb-1">
                تا تاریخ میلادی
              </label>
              <input
                id="filter-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          {/* Toggle Filter Controls & Query Telemetry */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOnlyImportant((v) => !v);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  onlyImportant
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                فقط پیام‌های مهم
              </button>

              <button
                type="button"
                onClick={() => {
                  setHasLink((v) => !v);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  hasLink
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                دارای لینک (URL)
              </button>

              {(query ||
                selectedChatId ||
                selectedSenderId ||
                selectedTag ||
                dateFrom ||
                dateTo ||
                onlyImportant ||
                hasLink) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  پاک‌سازی فیلترها
                </button>
              )}
            </div>

            {results && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span>
                  <span className="font-mono">{results.total}</span> پیام منطبق
                </span>
                <span aria-hidden="true">·</span>
                <span dir="ltr" className="font-mono">
                  {results.durationMs} ms
                </span>
                {results.parsedFtsQuery && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr" className="font-mono text-slate-600 truncate max-w-[300px]">
                      FTS5: {results.parsedFtsQuery}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && !results && (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="p-5 space-y-2.5">
                <div className="h-3.5 bg-slate-100 rounded w-1/3 animate-pulse" />
                <div className="h-4 bg-slate-100 rounded w-5/6 animate-pulse" />
                <div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && results && results.items.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
            <h3 className="text-base font-semibold text-slate-900">
              هیچ پیامی با شرایط جست‌وجوی فعلی یافت نشد
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              عبارت جست‌وجو یا فیلترهای گفتگو، تاریخ و برچسب را تغییر دهید یا از حالت «انعطاف‌پذیر فارسی» برای تطبیق خودکار حروف عربی و نیم‌فاصله استفاده کنید.
            </p>
            <div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                بازنشانی همه فیلترها
              </button>
            </div>
          </div>
        )}

        {/* Results List */}
        {results && results.items.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {results.items.map((msg) => {
              const isSelected =
                activeMessageKey?.chatId === msg.chatId &&
                activeMessageKey?.messageId === msg.messageId;
              const rowKey = `${msg.chatId}:${msg.messageId}`;

              return (
                <article
                  key={rowKey}
                  className={`p-5 transition-colors ${
                    isSelected ? 'bg-sky-50/50' : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Top Metadata Row — Clean Unboxed Text with · Separators */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 min-w-0">
                      <span className="font-semibold text-slate-900">{msg.chatTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>{chatTypeLabel(msg.chatType)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-700">{msg.senderName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums" dir="ltr">
                        {formatJalaliOrIsoDate(msg.date)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums" dir="ltr">
                        #{msg.messageId}
                      </span>
                      {msg.replyToMsgId !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            پاسخ به <span className="font-mono" dir="ltr">#{msg.replyToMsgId}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Row Functional Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleRowBookmark(e, msg)}
                        aria-label={
                          msg.isImportant
                            ? `حذف نشان مهم پیام ${msg.messageId}`
                            : `علامت‌گذاری مهم پیام ${msg.messageId}`
                        }
                        className={`p-1.5 rounded transition-colors ${
                          msg.isImportant
                            ? 'text-sky-600 bg-sky-50 hover:bg-sky-100'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleRowCopy(e, msg)}
                        aria-label={`کپی متن پیام ${msg.messageId}`}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      >
                        {copiedId === rowKey ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {msg.telegramUrl && (
                        <a
                          href={msg.telegramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`بازکردن پیام ${msg.messageId} در تلگرام`}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setActiveMessageKey({
                            chatId: msg.chatId,
                            messageId: msg.messageId,
                          })
                        }
                        className="px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 rounded transition-colors whitespace-nowrap shrink-0"
                      >
                        بررسی پیام
                      </button>
                    </div>
                  </div>

                  {/* Snippet / Text Body */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveMessageKey({
                        chatId: msg.chatId,
                        messageId: msg.messageId,
                      })
                    }
                    className="w-full text-right block"
                  >
                    <p className="text-[15px] text-slate-800 leading-7 whitespace-pre-line">
                      <BdiProseText text={query.trim() ? msg.snippet || msg.text : msg.text} />
                    </p>
                  </button>

                  {/* Quiet Footer Metadata Line */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5 text-xs text-slate-500">
                    <span>{cloudStatusLabel(msg.cloudStatus)}</span>
                    {msg.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700">
                          برچسب‌ها: {msg.tags.map((t) => `#${t}`).join(' ، ')}
                        </span>
                      </>
                    )}
                    {msg.links.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          <span className="font-mono">{msg.links.length}</span> لینک (
                          <span className="font-mono" dir="ltr">
                            {msg.links[0].domain}
                          </span>
                          )
                        </span>
                      </>
                    )}
                    {msg.personalNote && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-sky-700">دارای یادداشت شخصی</span>
                      </>
                    )}
                    {msg.hasMedia && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-700">کپشن متنی رسانه</span>
                      </>
                    )}
                  </div>
                </article>
              );
            })}

            {/* Pagination Footer */}
            <div className="px-5 py-3.5 flex items-center justify-between bg-slate-50/60 text-xs text-slate-600">
              <div className="tabular-nums">
                صفحه <span className="font-mono">{results.page}</span> از{' '}
                <span className="font-mono">{totalPages}</span> · مجموع{' '}
                <span className="font-mono">{results.total}</span> پیام
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={results.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  صفحه قبل
                </button>
                <button
                  type="button"
                  disabled={results.page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  صفحه بعد
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right/Side Inspector Drawer when a message is selected */}
      {activeMessageKey && (
        <MessageDetailDrawer
          chatId={activeMessageKey.chatId}
          messageId={activeMessageKey.messageId}
          onClose={() => setActiveMessageKey(null)}
          onSelectMessage={(cId, mId) => setActiveMessageKey({ chatId: cId, messageId: mId })}
          onMessageUpdated={handleMessageUpdatedInDrawer}
          onTagsChanged={onTagsUpdated}
        />
      )}
    </div>
  );
};
