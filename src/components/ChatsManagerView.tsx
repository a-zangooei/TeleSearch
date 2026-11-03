import React, { useState } from 'react';
import {
  Download,
  FileJson,
  FolderSearch,
  Pause,
  Play,
  Upload,
} from 'lucide-react';
import { api } from '../api/client';
import {
  ChatRecord,
  ImportStatus,
  SyncPolicy,
  SystemStats,
} from '../core/types';
import {
  chatTypeLabel,
  formatJalaliOrIsoDate,
  importStatusLabel,
  syncPolicyLabel,
} from '../utils/format';

interface ChatsManagerViewProps {
  chats: ChatRecord[];
  onChatsUpdated: (chats: ChatRecord[], stats?: SystemStats) => void;
  onFullRefresh: () => void;
  onOpenChatInSearch: (chatId: number) => void;
}

const SAMPLE_TELEGRAM_EXPORT = JSON.stringify(
  {
    name: 'کانال یادداشت‌های ایمونولوژی و ژنتیک',
    type: 'public_channel',
    id: 88442211,
    messages: [
      {
        id: 1,
        type: 'message',
        date: '2026-10-31T10:15:00Z',
        from: 'دکتر مریم احمدی',
        from_id: 'user2090',
        text: 'مقایسه پاسخ ایمنی ذاتی و اکتسابی: گیرنده‌های شبه‌تول (TLRs) الگوهای مولکولی بیماری‌زا را شناسایی می‌کنند.',
      },
      {
        id: 2,
        type: 'message',
        date: '2026-11-01T12:40:00Z',
        from: 'دکتر مریم احمدی',
        from_id: 'user2090',
        reply_to_message_id: 1,
        photo: 'photos/slide_02.jpg',
        text: [
          'مقاله تکمیلی از ',
          { type: 'bold', text: 'كتاب ایمونولوژی ابوالعباس' },
          ' و لینک مرجع: ',
          {
            type: 'text_link',
            text: 'PubMed Reference',
            href: 'https://pubmed.ncbi.nlm.nih.gov/38201145/',
          },
        ],
      },
    ],
  },
  null,
  2
);

export const ChatsManagerView: React.FC<ChatsManagerViewProps> = ({
  chats,
  onChatsUpdated,
  onFullRefresh,
  onOpenChatInSearch,
}) => {
  const [busyChatId, setBusyChatId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Telegram JSON importer state
  const [jsonContent, setJsonContent] = useState('');
  const [importPolicy, setImportPolicy] = useState<SyncPolicy>(SyncPolicy.LOCAL_ONLY);
  const [importingJson, setImportingJson] = useState(false);

  const handlePolicyChange = async (chatId: number, syncPolicy: SyncPolicy) => {
    setBusyChatId(chatId);
    setError(null);
    setFeedback(null);
    try {
      const customRule =
        syncPolicy === SyncPolicy.CUSTOM_RULES ? { requireLink: true } : null;
      const res = await api.updateChat(chatId, { syncPolicy, customRule });
      onChatsUpdated(res.chats, res.stats);
      setFeedback(
        `سیاست انتقال «${res.chat.title}» به ${syncPolicyLabel(syncPolicy)} تغییر یافت (${res.queuedCount} پیام جدید وارد صف Outbox شد).`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyChatId(null);
    }
  };

  const handleToggleActive = async (chat: ChatRecord) => {
    setBusyChatId(chat.chatId);
    setError(null);
    try {
      const res = await api.updateChat(chat.chatId, { isActive: !chat.isActive });
      onChatsUpdated(res.chats, res.stats);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyChatId(null);
    }
  };

  const handleImportBatch = async (chatId: number) => {
    setBusyChatId(chatId);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.importBatch(chatId, 2);
      onChatsUpdated(res.chats, res.stats);
      setFeedback(
        res.importedInBatch > 0
          ? `${res.importedInBatch} پیام جدید از تاریخچه «${res.chat.title}» دریافت و Checkpoint روی #${res.checkpointMsgId} ثبت شد.`
          : `تاریخچه «${res.chat.title}» کاملاً به‌روز است.`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyChatId(null);
    }
  };

  const handlePauseToggle = async (chat: ChatRecord) => {
    setBusyChatId(chat.chatId);
    setError(null);
    try {
      const shouldPause = chat.importStatus !== ImportStatus.PAUSED;
      const res = await api.setImportPause(chat.chatId, shouldPause);
      onChatsUpdated(res.chats);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyChatId(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setJsonContent(reader.result);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSubmitJsonImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (!jsonContent.trim()) {
      setError('لطفاً فایل result.json تلگرام را انتخاب کنید یا محتوای JSON را وارد نمایید.');
      return;
    }

    setImportingJson(true);
    try {
      const res = await api.importTelegramJson(jsonContent, importPolicy);
      onChatsUpdated(res.chats, res.stats);
      onFullRefresh();
      setFeedback(
        `درون‌ریزی متنی «${res.chat.title}» انجام شد: ${res.importedCount} پیام جدید ذخیره شد و ${res.skippedDuplicates} رکورد تکراری نادیده گرفته شد.`
      );
      setJsonContent('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingJson(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900">
          مدیریت گفتگوها، Checkpoint و دریافت تاریخچه
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          دریافت تاریخچه به‌صورت دسته‌ای (Batch) با ثبت خودکار Checkpoint انجام می‌شود تا در صورت توقف برنامه یا قطعی اینترنت، ادامه عملیات بدون پیام تکراری ممکن باشد.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {feedback}
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Chats Data Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="px-4 py-3">عنوان گفتگو</th>
                <th className="px-4 py-3">نوع و شناسه</th>
                <th className="px-4 py-3">پیام‌های آرشیوشده</th>
                <th className="px-4 py-3">وضعیت Checkpoint</th>
                <th className="px-4 py-3">سیاست انتقال ابری</th>
                <th className="px-4 py-3">وضعیت آرشیو</th>
                <th className="px-4 py-3">عملیات دریافت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {chats.map((chat) => {
                const progressPct =
                  chat.totalEstimated > 0
                    ? Math.min(100, Math.round((chat.messageCount / chat.totalEstimated) * 100))
                    : 100;
                const isBusy = busyChatId === chat.chatId;

                return (
                  <tr key={chat.chatId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 min-w-[220px]">
                      <div className="font-semibold text-slate-900">{chat.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        آخرین همگام‌سازی:{' '}
                        <span className="font-mono" dir="ltr">
                          {formatJalaliOrIsoDate(chat.lastSyncedAt)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                      <div>{chatTypeLabel(chat.chatType)}</div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums" dir="ltr">
                        {chat.chatId}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 font-semibold">
                        <span className="font-mono">{chat.messageCount}</span> پیام
                      </div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono">{chat.importantCount}</span> پیام مهم
                      </div>
                    </td>

                    <td className="px-4 py-3.5 min-w-[170px]">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 mb-1">
                        <span className="whitespace-nowrap">
                          {importStatusLabel(chat.importStatus)}
                        </span>
                        <span className="font-mono tabular-nums whitespace-nowrap" dir="ltr">
                          #{chat.checkpointMsgId} ({progressPct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-600 transition-transform"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      {chat.stagedRemaining > 0 && (
                        <div className="text-[11px] text-amber-700 mt-1 tabular-nums whitespace-nowrap">
                          <span className="font-mono">{chat.stagedRemaining}</span> پیام آماده دریافت از تلگرام
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <label htmlFor={`policy-${chat.chatId}`} className="sr-only">
                        سیاست انتقال ابری {chat.title}
                      </label>
                      <select
                        id={`policy-${chat.chatId}`}
                        disabled={isBusy}
                        value={chat.syncPolicy}
                        onChange={(e) =>
                          handlePolicyChange(chat.chatId, e.target.value as SyncPolicy)
                        }
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
                      >
                        <option value={SyncPolicy.LOCAL_ONLY}>LOCAL_ONLY (فقط محلی)</option>
                        <option value={SyncPolicy.ALL_MESSAGES}>ALL_MESSAGES (همه پیام‌ها)</option>
                        <option value={SyncPolicy.IMPORTANT_ONLY}>
                          IMPORTANT_ONLY (فقط مهم‌ها)
                        </option>
                        <option value={SyncPolicy.CUSTOM_RULES}>
                          CUSTOM_RULES (فقط دارای لینک)
                        </option>
                      </select>
                    </td>

                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleActive(chat)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                          chat.isActive
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {chat.isActive ? 'آرشیو فعال' : 'غیرفعال'}
                      </button>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {chat.stagedRemaining > 0 && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy || !chat.isActive}
                              onClick={() => handleImportBatch(chat.chatId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              دریافت دسته بعدی
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handlePauseToggle(chat)}
                              aria-label={
                                chat.importStatus === ImportStatus.PAUSED
                                  ? `ادامه دریافت ${chat.title}`
                                  : `توقف دریافت ${chat.title}`
                              }
                              className="p-1.5 text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors shrink-0"
                            >
                              {chat.importStatus === ImportStatus.PAUSED ? (
                                <Play className="w-3.5 h-3.5" />
                              ) : (
                                <Pause className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenChatInSearch(chat.chatId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <FolderSearch className="w-3.5 h-3.5" />
                          مشاهده پیام‌ها
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Telegram Desktop Text-Only JSON Importer */}
      <form
        onSubmit={handleSubmitJsonImport}
        className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              درون‌ریزی خروجی متنی Telegram Desktop (result.json)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              فقط متن پیام‌ها، کپشن‌ها، روابط Reply و لینک‌ها استخراج و در SQLite + FTS5 ذخیره می‌شوند؛ تمام مسیرهای فایل و رسانه نادیده گرفته می‌شوند.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJsonContent(SAMPLE_TELEGRAM_EXPORT)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <FileJson className="w-3.5 h-3.5" />
            بارگذاری نمونه JSON استاندارد تلگرام
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tg-json-file" className="block text-xs font-medium text-slate-700 mb-1.5">
              انتخاب فایل result.json از کامپیوتر
            </label>
            <input
              id="tg-json-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-600 file:ml-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="tg-json-policy"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              سیاست انتقال ابری پیش‌فرض برای گفتگوی درون‌ریزی‌شده
            </label>
            <select
              id="tg-json-policy"
              value={importPolicy}
              onChange={(e) => setImportPolicy(e.target.value as SyncPolicy)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              <option value={SyncPolicy.LOCAL_ONLY}>LOCAL_ONLY — فقط آرشیو محلی</option>
              <option value={SyncPolicy.IMPORTANT_ONLY}>IMPORTANT_ONLY — فقط پیام‌های مهم</option>
              <option value={SyncPolicy.ALL_MESSAGES}>ALL_MESSAGES — همه پیام‌ها</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tg-json-textarea" className="block text-xs font-medium text-slate-700 mb-1.5">
            پیش‌نمایش یا جای‌گذاری مستقیم محتوای JSON
          </label>
          <textarea
            id="tg-json-textarea"
            dir="ltr"
            rows={5}
            value={jsonContent}
            onChange={(e) => setJsonContent(e.target.value)}
            placeholder='{"name": "Channel Name", "type": "public_channel", "id": 12345, "messages": [...]}'
            className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={importingJson}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {importingJson ? 'در حال پردازش و ایندکس...' : 'شروع درون‌ریزی متنی در SQLite'}
          </button>
        </div>
      </form>
    </div>
  );
};
