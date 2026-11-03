export enum ChatType {
  PRIVATE = 'private',
  GROUP = 'group',
  SUPERGROUP = 'supergroup',
  CHANNEL = 'channel',
}

export enum SyncPolicy {
  LOCAL_ONLY = 'LOCAL_ONLY',
  ALL_MESSAGES = 'ALL_MESSAGES',
  IMPORTANT_ONLY = 'IMPORTANT_ONLY',
  CUSTOM_RULES = 'CUSTOM_RULES',
}

export enum CloudStatus {
  NOT_SELECTED = 'NOT_SELECTED',
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}

export enum SearchMode {
  FLEXIBLE = 'flexible',
  EXACT = 'exact',
}

export enum ImportStatus {
  IDLE = 'IDLE',
  IMPORTING = 'IMPORTING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export enum OutboxOperation {
  UPSERT = 'UPSERT',
  DELETE = 'DELETE',
}

export interface CustomSyncRule {
  keywords?: string[];
  requireLink?: boolean;
  requiredTags?: string[];
  senderId?: number;
}

export interface NormalizationOptions {
  arabicChars: boolean;
  stripDiacritics: boolean;
  unifyHalfSpace: boolean;
  normalizeDigits: boolean;
}

export interface ExtractedLink {
  url: string;
  domain: string;
}

export interface ChatRecord {
  accountId: number;
  chatId: number;
  title: string;
  chatType: ChatType;
  username: string | null;
  isActive: boolean;
  syncPolicy: SyncPolicy;
  customRule: CustomSyncRule | null;
  lastMessageId: number | null;
  lastMessageDate: string | null;
  lastSyncedAt: string | null;
  messageCount: number;
  importantCount: number;
  checkpointMsgId: number;
  totalEstimated: number;
  importedCount: number;
  importStatus: ImportStatus;
  stagedRemaining: number;
}

export interface MessageRecord {
  accountId: number;
  chatId: number;
  chatTitle: string;
  chatType: ChatType;
  chatUsername: string | null;
  messageId: number;
  senderId: number | null;
  senderName: string;
  senderUsername: string | null;
  date: string;
  editDate: string | null;
  text: string;
  normalizedText: string;
  snippet?: string;
  replyToMsgId: number | null;
  forwardFromName: string | null;
  groupedId: string | null;
  views: number | null;
  hasMedia: boolean;
  isDeleted: boolean;
  isImportant: boolean;
  cloudStatus: CloudStatus;
  version: number;
  tags: string[];
  personalNote: string | null;
  links: ExtractedLink[];
  telegramUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDetailResponse {
  message: MessageRecord;
  replyParent: MessageRecord | null;
  replies: MessageRecord[];
}

export interface SearchFilters {
  q?: string;
  mode?: SearchMode;
  chatId?: number;
  senderId?: number;
  dateFrom?: string;
  dateTo?: string;
  tag?: string;
  onlyImportant?: boolean;
  hasLink?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SearchResponse {
  items: MessageRecord[];
  total: number;
  page: number;
  pageSize: number;
  durationMs: number;
  parsedFtsQuery: string;
}

export interface OutboxRecord {
  id: number;
  idempotencyKey: string;
  accountId: number;
  chatId: number;
  chatTitle: string;
  messageId: number;
  operation: OutboxOperation;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncHistoryEntry {
  id: number;
  provider: string;
  batchSize: number;
  syncedCount: number;
  failedCount: number;
  durationMs: number;
  createdAt: string;
}

export interface SystemStats {
  totalChats: number;
  activeChats: number;
  totalMessages: number;
  importantMessages: number;
  totalLinks: number;
  totalTags: number;
  totalUsers: number;
  dbSizeBytes: number;
  ftsRowCount: number;
  outboxPending: number;
  outboxSynced: number;
  outboxFailed: number;
  cloudProvider: string;
  cloudWorkerPaused: boolean;
  d1EstimatedStorageBytes: number;
  d1QuotaLimitBytes: number;
  lastBackupAt: string | null;
}

export interface BackupFileEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  integrityOk: boolean;
}
