import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Link2,
  MessageSquareReply,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { MessageDetailResponse, MessageRecord, SystemStats } from '../core/types';
import {
  chatTypeLabel,
  cloudStatusLabel,
  formatJalaliOrIsoDate,
} from '../utils/format';
import { BdiProseText } from './BdiProseText';

interface MessageDetailDrawerProps {
  chatId: number;
  messageId: number;
  onClose: () => void;
  onSelectMessage: (chatId: number, messageId: number) => void;
  onMessageUpdated: (updated: MessageRecord, stats?: SystemStats) => void;
  onTagsChanged: (tags: Array<{ id: number; name: string; messageCount: number }>) => void;
}

export const MessageDetailDrawer: React.FC<MessageDetailDrawerProps> = ({
  chatId,
  messageId,
  onClose,
  onSelectMessage,
  onMessageUpdated,
  onTagsChanged,
}) => {
  const [detail, setDetail] = useState<MessageDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSavedToast, setNoteSavedToast] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncQueuedToast, setSyncQueuedToast] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNoteSavedToast(false);
    setSyncQueuedToast(false);

    api
      .getMessageDetail(chatId, messageId)
      .then((res) => {
        if (!active) return;
        setDetail(res);
        setNoteInput(res.message.personalNote || '');
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [chatId, messageId]);

  const msg = detail?.message;

  const handleToggleImportant = async () => {
    if (!msg) return;
    try {
      const res = await api.toggleImportant(msg.chatId, msg.messageId, !msg.isImportant);
      setDetail((prev) => (prev ? { ...prev, message: res.message } : prev));
      onMessageUpdated(res.message, res.stats);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg || !tagInput.trim()) return;
    try {
      const res = await api.addTag(msg.chatId, msg.messageId, tagInput.trim());
      setDetail((prev) => (prev ? { ...prev, message: res.message } : prev));
      setTagInput('');
      onMessageUpdated(res.message);
      onTagsChanged(res.tags);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    if (!msg) return;
    try {
      const res = await api.removeTag(msg.chatId, msg.messageId, tagName);
      setDetail((prev) => (prev ? { ...prev, message: res.message } : prev));
      onMessageUpdated(res.message);
      onTagsChanged(res.tags);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg) return;
    setSavingNote(true);
    try {
      const res = await api.saveNote(msg.chatId, msg.messageId, noteInput);
      setDetail((prev) => (prev ? { ...prev, message: res.message } : prev));
      onMessageUpdated(res.message);
      setNoteSavedToast(true);
      setTimeout(() => setNoteSavedToast(false), 2200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingNote(false);
    }
  };

  const handleQueueManualSync = async () => {
    if (!msg) return;
    try {
      const res = await api.queueManualSync(msg.chatId, msg.messageId);
      setDetail((prev) => (prev ? { ...prev, message: res.message } : prev));
      onMessageUpdated(res.message, res.stats);
      setSyncQueuedToast(true);
      setTimeout(() => setSyncQueuedToast(false), 2200);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCopy = async () => {
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <aside
      aria-label="جزئیات پیام آرشیوشده"
      className="w-full lg:w-[430px] xl:w-[460px] shrink-0 bg-white border-t lg:border-t-0 lg:border-r border-slate-200 flex flex-col lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white z-10">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            پرونده کامل پیام آرشیوشده
          </h2>
          {msg && (
            <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
              Chat {msg.chatId} · Msg #{msg.messageId} · v{msg.version}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="بستن جزئیات پیام"
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="p-6 space-y-4">
          <div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse" />
          <div className="h-24 bg-slate-100 rounded w-full animate-pulse" />
          <div className="h-10 bg-slate-100 rounded w-full animate-pulse" />
        </div>
      )}

      {error && (
        <div className="m-5 p-3.5 border border-red-200 bg-red-50 text-red-700 text-xs rounded-md">
          {error}
        </div>
      )}

      {!loading && msg && (
        <div className="p-5 space-y-6 text-sm">
          {/* Clean Unboxed Metadata */}
          <div className="space-y-1.5 pb-4 border-b border-slate-100">
            <div className="font-semibold text-slate-900">{msg.chatTitle}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>{chatTypeLabel(msg.chatType)}</span>
              <span aria-hidden="true">·</span>
              <span>فرستنده: {msg.senderName}</span>
              {msg.senderId !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">ID {msg.senderId}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono tabular-nums">{formatJalaliOrIsoDate(msg.date)}</span>
              {msg.editDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>ویرایش‌شده: {formatJalaliOrIsoDate(msg.editDate)}</span>
                </>
              )}
              {msg.views !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    <span className="font-mono">{msg.views.toLocaleString()}</span> بازدید
                  </span>
                </>
              )}
            </div>
            {msg.forwardFromName && (
              <div className="text-xs text-slate-500">
                فورواردشده از: <span className="text-slate-700">{msg.forwardFromName}</span>
              </div>
            )}
            {msg.hasMedia && (
              <div className="text-xs text-amber-700 pt-1">
                دارای پرچم رسانه (has_media = true) · طبق اصل Text-Only فقط متن کپشن آرشیو شده است
              </div>
            )}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleImportant}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                msg.isImportant
                  ? 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              {msg.isImportant ? 'علامت‌گذاری‌شده به‌عنوان مهم' : 'علامت‌گذاری مهم'}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'کپی شد' : 'کپی متن اصلی'}
            </button>

            {msg.telegramUrl && (
              <a
                href={msg.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                تلگرام
              </a>
            )}
          </div>

          {/* Reply Parent */}
          {detail?.replyParent && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <MessageSquareReply className="w-3.5 h-3.5" />
                  در پاسخ به پیام #{detail.replyParent.messageId} ({detail.replyParent.senderName})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSelectMessage(detail.replyParent!.chatId, detail.replyParent!.messageId)
                  }
                  className="text-sky-700 hover:underline font-medium whitespace-nowrap shrink-0"
                >
                  مشاهده پیام اصلی
                </button>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                {detail.replyParent.text}
              </p>
            </div>
          )}

          {/* Preserved Original Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">متن اصلی ذخیره‌شده (بدون تغییر نیم‌فاصله)</span>
              <span className="tabular-nums">
                <span className="font-mono">{msg.text.length}</span> کاراکتر
              </span>
            </div>
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-md text-slate-900 leading-7 whitespace-pre-wrap break-words text-[15px]">
              <BdiProseText text={msg.text} />
            </div>
          </div>

          {/* Replies in Archive */}
          {detail && detail.replies.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-800">
                پاسخ‌های مرتبط در آرشیو ({detail.replies.length})
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {detail.replies.map((rep) => (
                  <button
                    key={rep.messageId}
                    type="button"
                    onClick={() => onSelectMessage(rep.chatId, rep.messageId)}
                    className="w-full text-right p-3 hover:bg-slate-50 transition-colors block space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{rep.senderName}</span>
                      <span className="font-mono tabular-nums">#{rep.messageId}</span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{rep.text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Links */}
          {msg.links.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-800">
                لینک‌های استخراج‌شده ({msg.links.length})
              </h3>
              <ul className="space-y-1.5">
                {msg.links.map((lnk) => (
                  <li key={lnk.url} className="flex items-center justify-between gap-2 text-xs">
                    <a
                      href={lnk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="inline-flex items-center gap-1.5 text-sky-700 hover:underline font-mono truncate"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{lnk.url}</span>
                    </a>
                    <span className="text-slate-400 font-mono shrink-0">{lnk.domain}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tags Management */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <label htmlFor="msg-tag-input" className="block text-xs font-semibold text-slate-800">
              برچسب‌های شخصی
            </label>
            {msg.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {msg.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      aria-label={`حذف برچسب ${t}`}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">هنوز برچسبی برای این پیام ثبت نشده است.</p>
            )}

            <form onSubmit={handleAddTag} className="flex items-center gap-2">
              <input
                id="msg-tag-input"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="افزودن برچسب جدید (مثلاً: مرور_امتحان)"
                className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                افزودن
              </button>
            </form>
          </div>

          {/* Personal Note */}
          <form onSubmit={handleSaveNote} className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label htmlFor="msg-personal-note" className="text-xs font-semibold text-slate-800">
                یادداشت پژوهشی و شخصی
              </label>
              {noteSavedToast && (
                <span className="text-xs text-emerald-700 font-medium">یادداشت ذخیره شد</span>
              )}
            </div>
            <textarea
              id="msg-personal-note"
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="برداشت شخصی، ارجاع به منابع دیگر یا نکات تکمیلی درباره این پیام..."
              className="w-full p-3 text-xs bg-white border border-slate-300 rounded-md leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingNote}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {savingNote ? 'در حال ذخیره...' : 'ذخیره یادداشت'}
              </button>
            </div>
          </form>

          {/* Cloud Sync Status & Manual Queue */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">وضعیت انتقال ابری:</span>
              <span className="font-medium text-slate-800">{cloudStatusLabel(msg.cloudStatus)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleQueueManualSync}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                ارسال دستی به صف Outbox
              </button>
              {syncQueuedToast && (
                <span className="text-xs text-emerald-700">در صف انتقال ثبت شد</span>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
