import { extractLinks, normalizePersianText } from './normalization';
import {
  ChatType,
  CloudStatus,
  CustomSyncRule,
  OutboxOperation,
  SyncPolicy,
} from './types';

export interface PolicyEvaluationInput {
  syncPolicy: SyncPolicy;
  customRule: CustomSyncRule | null;
  isImportant: boolean;
  text: string;
  tags: string[];
  senderId: number | null;
}

/**
 * Evaluates whether a message qualifies for Cloud Sync under its chat's policy.
 * Strictly decouples personal importance (`isImportant`) from sync eligibility (`syncPolicy`):
 * e.g., `isImportant = true` + `LOCAL_ONLY` => `false` (remains strictly local).
 */
export function shouldSyncMessageToCloud(input: PolicyEvaluationInput): boolean {
  switch (input.syncPolicy) {
    case SyncPolicy.LOCAL_ONLY:
      return false;

    case SyncPolicy.ALL_MESSAGES:
      return true;

    case SyncPolicy.IMPORTANT_ONLY:
      return Boolean(input.isImportant);

    case SyncPolicy.CUSTOM_RULES: {
      const rule = input.customRule;
      if (!rule) return false;

      if (rule.requireLink) {
        const links = extractLinks(input.text);
        if (links.length === 0) return false;
      }

      if (typeof rule.senderId === 'number' && input.senderId !== rule.senderId) {
        return false;
      }

      if (rule.requiredTags && rule.requiredTags.length > 0) {
        const hasMatchingTag = rule.requiredTags.some((tag) => input.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      if (rule.keywords && rule.keywords.length > 0) {
        const normalizedMsg = normalizePersianText(input.text);
        const matchesKeyword = rule.keywords.some((kw) => {
          const normKw = normalizePersianText(kw);
          return normKw.length > 0 && normalizedMsg.includes(normKw);
        });
        if (!matchesKeyword) return false;
      }

      return Boolean(
        rule.requireLink ||
          typeof rule.senderId === 'number' ||
          (rule.requiredTags && rule.requiredTags.length > 0) ||
          (rule.keywords && rule.keywords.length > 0)
      );
    }

    default:
      return false;
  }
}

export function computeInitialCloudStatus(
  eligible: boolean,
  currentStatus?: CloudStatus
): CloudStatus {
  if (!eligible) {
    return CloudStatus.NOT_SELECTED;
  }
  if (currentStatus === CloudStatus.SYNCED) {
    return CloudStatus.SYNCED;
  }
  return CloudStatus.PENDING;
}

/**
 * Generates a deterministic idempotency key preventing duplicate cloud writes on retry.
 * Format: accountId:chatId:messageId:operation:vVersion
 */
export function buildIdempotencyKey(
  accountId: number,
  chatId: number,
  messageId: number,
  operation: OutboxOperation,
  version: number
): string {
  return `${accountId}:${chatId}:${messageId}:${operation}:v${version}`;
}

export interface ParsedTelegramExportMessage {
  messageId: number;
  senderId: number | null;
  senderName: string;
  date: string;
  editDate: string | null;
  text: string;
  replyToMsgId: number | null;
  forwardFromName: string | null;
  hasMedia: boolean;
}

export interface ParsedTelegramExport {
  chatId: number;
  title: string;
  chatType: ChatType;
  messages: ParsedTelegramExportMessage[];
}

/**
 * Parses a Telegram Desktop JSON export (`result.json`) into strictly text-only records.
 * Extracts plain strings and rich text entity arrays while discarding all media file paths/blobs.
 */
export function parseTelegramExportJson(rawJson: string): ParsedTelegramExport {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    throw new Error('فایل JSON معتبر نیست. لطفاً خروجی متنی Telegram Desktop (result.json) را انتخاب کنید.');
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.messages)) {
    throw new Error('ساختار فایل فاقد آرایه messages استاندارد تلگرام است.');
  }

  const rawChatId = typeof data.id === 'number' ? data.id : Math.abs(hashString(String(data.name || 'imported')));
  const title = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : `گفتگوی درونریزی شده ${rawChatId}`;
  const rawType = typeof data.type === 'string' ? data.type.toLowerCase() : '';

  let chatType = ChatType.CHANNEL;
  if (rawType.includes('personal') || rawType.includes('private')) {
    chatType = ChatType.PRIVATE;
  } else if (rawType.includes('supergroup')) {
    chatType = ChatType.SUPERGROUP;
  } else if (rawType.includes('group')) {
    chatType = ChatType.GROUP;
  }

  const parsedMessages: ParsedTelegramExportMessage[] = [];

  for (const item of data.messages as Record<string, unknown>[]) {
    if (!item || item.type !== 'message') continue;
    const messageId = Number(item.id);
    if (!Number.isFinite(messageId) || messageId <= 0) continue;

    const text = flattenTelegramTextField(item.text);
    const hasMedia = Boolean(item.photo || item.file || item.media_type || item.mime_type);

    // Skip empty service/media items with zero text unless they carry a media flag with caption
    if (!text.trim() && !hasMedia) continue;

    const fromIdRaw = typeof item.from_id === 'string' ? item.from_id.replace(/\D+/g, '') : '';
    const senderId = fromIdRaw ? Number(fromIdRaw) : null;
    const senderName =
      typeof item.from === 'string' && item.from.trim()
        ? item.from.trim()
        : typeof item.actor === 'string'
        ? item.actor
        : title;

    const date =
      typeof item.date === 'string' && item.date
        ? normalizeIsoDate(item.date)
        : new Date().toISOString();

    const editDate =
      typeof item.edited === 'string' && item.edited ? normalizeIsoDate(item.edited) : null;

    const replyToMsgId =
      typeof item.reply_to_message_id === 'number' ? item.reply_to_message_id : null;

    const forwardFromName =
      typeof item.forwarded_from === 'string' && item.forwarded_from.trim()
        ? item.forwarded_from.trim()
        : null;

    parsedMessages.push({
      messageId,
      senderId,
      senderName,
      date,
      editDate,
      text: text.trim() || '[پیام حاوی رسانه بدون متن کپشن — فایل رسانه طبق سیاست سیستم ذخیره نشد]',
      replyToMsgId,
      forwardFromName,
      hasMedia,
    });
  }

  return {
    chatId: rawChatId,
    title,
    chatType,
    messages: parsedMessages,
  };
}

function flattenTelegramTextField(field: unknown): string {
  if (typeof field === 'string') return field;
  if (!Array.isArray(field)) return '';

  const parts: string[] = [];
  for (const segment of field) {
    if (typeof segment === 'string') {
      parts.push(segment);
    } else if (segment && typeof segment === 'object') {
      const obj = segment as Record<string, unknown>;
      if (typeof obj.text === 'string') {
        parts.push(obj.text);
        if (obj.type === 'text_link' && typeof obj.href === 'string' && !obj.text.includes(obj.href)) {
          parts.push(` (${obj.href})`);
        }
      }
    }
  }
  return parts.join('');
}

function normalizeIsoDate(dateStr: string): string {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}
