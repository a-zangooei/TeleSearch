import {
  BackupFileEntry,
  ChatRecord,
  CustomSyncRule,
  MessageDetailResponse,
  MessageRecord,
  OutboxRecord,
  SearchFilters,
  SearchResponse,
  SyncHistoryEntry,
  SyncPolicy,
  SystemStats,
} from '../core/types';

export interface OverviewResponse {
  stats: SystemStats;
  chats: ChatRecord[];
  tags: Array<{ id: number; name: string; messageCount: number }>;
  users: Array<{ userId: number; displayName: string; username: string | null; messageCount: number }>;
  settings: Record<string, string>;
  integrity: { ok: boolean; result: string };
}

export interface FoundationFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `خطا در ارتباط با سرور (${res.status})`);
  }
  return data as T;
}

export const api = {
  getOverview: () => requestJson<OverviewResponse>('/api/overview'),

  search: (filters: SearchFilters) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.mode) params.set('mode', filters.mode);
    if (typeof filters.chatId === 'number') params.set('chatId', String(filters.chatId));
    if (typeof filters.senderId === 'number') params.set('senderId', String(filters.senderId));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.onlyImportant) params.set('onlyImportant', 'true');
    if (filters.hasLink) params.set('hasLink', 'true');
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
    return requestJson<SearchResponse>(`/api/search?${params.toString()}`);
  },

  getMessageDetail: (chatId: number, messageId: number) =>
    requestJson<MessageDetailResponse>(`/api/messages/${chatId}/${messageId}`),

  toggleImportant: (chatId: number, messageId: number, isImportant: boolean) =>
    requestJson<{ message: MessageRecord; stats: SystemStats }>(
      `/api/messages/${chatId}/${messageId}/important`,
      {
        method: 'POST',
        body: JSON.stringify({ isImportant }),
      }
    ),

  addTag: (chatId: number, messageId: number, tag: string) =>
    requestJson<{
      message: MessageRecord;
      tags: Array<{ id: number; name: string; messageCount: number }>;
    }>(`/api/messages/${chatId}/${messageId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),

  removeTag: (chatId: number, messageId: number, tag: string) =>
    requestJson<{
      message: MessageRecord;
      tags: Array<{ id: number; name: string; messageCount: number }>;
    }>(`/api/messages/${chatId}/${messageId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    }),

  saveNote: (chatId: number, messageId: number, noteText: string) =>
    requestJson<{ message: MessageRecord }>(`/api/messages/${chatId}/${messageId}/note`, {
      method: 'PUT',
      body: JSON.stringify({ noteText }),
    }),

  queueManualSync: (chatId: number, messageId: number) =>
    requestJson<{ message: MessageRecord; stats: SystemStats }>(
      `/api/messages/${chatId}/${messageId}/queue-sync`,
      { method: 'POST' }
    ),

  updateChat: (
    chatId: number,
    payload: { isActive?: boolean; syncPolicy?: SyncPolicy; customRule?: CustomSyncRule | null }
  ) =>
    requestJson<{
      chat: ChatRecord;
      queuedCount: number;
      chats: ChatRecord[];
      stats: SystemStats;
    }>(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  importBatch: (chatId: number, batchSize = 2) =>
    requestJson<{
      chat: ChatRecord;
      importedInBatch: number;
      checkpointMsgId: number;
      chats: ChatRecord[];
      stats: SystemStats;
    }>(`/api/chats/${chatId}/import-batch`, {
      method: 'POST',
      body: JSON.stringify({ batchSize }),
    }),

  setImportPause: (chatId: number, paused: boolean) =>
    requestJson<{ chat: ChatRecord; chats: ChatRecord[] }>(`/api/chats/${chatId}/import-pause`, {
      method: 'POST',
      body: JSON.stringify({ paused }),
    }),

  importTelegramJson: (rawJson: string, syncPolicy: SyncPolicy) =>
    requestJson<{
      chat: ChatRecord;
      importedCount: number;
      skippedDuplicates: number;
      chats: ChatRecord[];
      stats: SystemStats;
      tags: Array<{ id: number; name: string; messageCount: number }>;
      users: Array<{ userId: number; displayName: string; username: string | null; messageCount: number }>;
    }>('/api/import/telegram-json', {
      method: 'POST',
      body: JSON.stringify({ rawJson, syncPolicy }),
    }),

  getLinks: () =>
    requestJson<{
      links: Array<{
        url: string;
        domain: string;
        chatId: number;
        chatTitle: string;
        messageId: number;
        date: string;
      }>;
    }>('/api/knowledge/links'),

  getOutbox: (status = 'ALL') =>
    requestJson<{
      outbox: OutboxRecord[];
      history: SyncHistoryEntry[];
      stats: SystemStats;
    }>(`/api/sync/outbox?status=${encodeURIComponent(status)}`),

  processOutbox: (batchSize = 25) =>
    requestJson<{
      syncedCount: number;
      failedCount: number;
      provider: string;
      outbox: OutboxRecord[];
      history: SyncHistoryEntry[];
      stats: SystemStats;
    }>('/api/sync/process', {
      method: 'POST',
      body: JSON.stringify({ batchSize }),
    }),

  updateSettings: (updates: Record<string, string>) =>
    requestJson<{ settings: Record<string, string>; stats: SystemStats }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  previewNormalization: (text: string, query: string) =>
    requestJson<{
      normalized: string;
      indexable: string;
      ftsFlexible: string;
      ftsExact: string;
    }>('/api/normalize-preview', {
      method: 'POST',
      body: JSON.stringify({ text, query }),
    }),

  rebuildFts: () =>
    requestJson<{
      indexedCount: number;
      durationMs: number;
      stats: SystemStats;
      integrity: { ok: boolean; result: string };
    }>('/api/maintenance/rebuild-fts', { method: 'POST' }),

  getBackups: () =>
    requestJson<{ backups: BackupFileEntry[]; integrity: { ok: boolean; result: string } }>(
      '/api/maintenance/backups'
    ),

  createBackup: () =>
    requestJson<{
      backup: BackupFileEntry;
      backups: BackupFileEntry[];
      stats: SystemStats;
    }>('/api/maintenance/backups', { method: 'POST' }),

  getFoundationFiles: () =>
    requestJson<{ files: FoundationFile[] }>('/api/foundation/files'),
};
