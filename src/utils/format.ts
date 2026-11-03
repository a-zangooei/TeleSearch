import { ChatType, CloudStatus, ImportStatus, SyncPolicy } from '../core/types';

export function formatJalaliOrIsoDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function chatTypeLabel(type: ChatType): string {
  switch (type) {
    case ChatType.CHANNEL:
      return 'کانال';
    case ChatType.SUPERGROUP:
      return 'سوپرگروه';
    case ChatType.GROUP:
      return 'گروه';
    case ChatType.PRIVATE:
      return 'خصوصی';
    default:
      return type;
  }
}

export function syncPolicyLabel(policy: SyncPolicy): string {
  switch (policy) {
    case SyncPolicy.LOCAL_ONLY:
      return 'فقط محلی (LOCAL_ONLY)';
    case SyncPolicy.ALL_MESSAGES:
      return 'همه پیام‌ها (ALL_MESSAGES)';
    case SyncPolicy.IMPORTANT_ONLY:
      return 'فقط مهم‌ها (IMPORTANT_ONLY)';
    case SyncPolicy.CUSTOM_RULES:
      return 'مبتنی بر قاعده (CUSTOM_RULES)';
    default:
      return policy;
  }
}

export function cloudStatusLabel(status: CloudStatus): string {
  switch (status) {
    case CloudStatus.NOT_SELECTED:
      return 'انتخاب‌نشده (فقط لوکال)';
    case CloudStatus.PENDING:
      return 'در صف انتقال ابری';
    case CloudStatus.SYNCED:
      return 'همگام‌سازی‌شده در کلود';
    case CloudStatus.FAILED:
      return 'خطا در انتقال';
    default:
      return status;
  }
}

export function importStatusLabel(status: ImportStatus): string {
  switch (status) {
    case ImportStatus.IDLE:
      return 'آماده';
    case ImportStatus.IMPORTING:
      return 'در حال دریافت دسته‌ای';
    case ImportStatus.PAUSED:
      return 'متوقف در Checkpoint';
    case ImportStatus.COMPLETED:
      return 'تکمیل‌شده';
    default:
      return status;
  }
}
