import React, { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  CloudUpload,
  Download,
  Menu,
  MessageSquare,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { api, OverviewResponse } from './api/client';
import { ChatsManagerView } from './components/ChatsManagerView';
import { CloudSyncView } from './components/CloudSyncView';
import { KnowledgeHubView } from './components/KnowledgeHubView';
import { SearchWorkspace } from './components/SearchWorkspace';
import { SettingsFoundationView } from './components/SettingsFoundationView';
import { ChatRecord, SystemStats } from './core/types';
import { formatBytes } from './utils/format';

type NavSection = 'search' | 'chats' | 'knowledge' | 'sync' | 'settings';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  breadcrumb: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'search', label: 'جست‌وجو در پیام‌ها', breadcrumb: 'موتور جست‌وجوی FTS5', icon: Search },
  { id: 'chats', label: 'گفتگوها و تاریخچه', breadcrumb: 'گفتگوها و Checkpoint', icon: MessageSquare },
  { id: 'knowledge', label: 'مهم‌ها و برچسب‌ها', breadcrumb: 'مدیریت دانش و خروجی', icon: Bookmark },
  { id: 'sync', label: 'همگام‌سازی ابری', breadcrumb: 'صف انتقال Outbox', icon: CloudUpload },
  { id: 'settings', label: 'تنظیمات و معماری', breadcrumb: 'تنظیمات، پشتیبان‌گیری و Milestone 0', icon: Settings },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('search');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpToChatId, setJumpToChatId] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.getOverview();
      setOverview(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleStatsUpdated = useCallback((stats: SystemStats) => {
    setOverview((prev) => (prev ? { ...prev, stats } : prev));
  }, []);

  const handleTagsUpdated = useCallback(
    (tags: Array<{ id: number; name: string; messageCount: number }>) => {
      setOverview((prev) => (prev ? { ...prev, tags } : prev));
    },
    []
  );

  const handleChatsUpdated = useCallback((chats: ChatRecord[], stats?: SystemStats) => {
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            chats,
            stats: stats || prev.stats,
          }
        : prev
    );
  }, []);

  const handleStatsAndSettingsUpdated = useCallback(
    (stats: SystemStats, settings?: Record<string, string>) => {
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              stats,
              settings: settings || prev.settings,
            }
          : prev
      );
    },
    []
  );

  const handleOpenChatInSearch = (chatId: number) => {
    setJumpToChatId(chatId);
    setActiveSection('search');
  };

  const handleQuickExportJson = async () => {
    const res = await fetch('/api/export/json?onlyImportant=false');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'telegram-knowledge-archive.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeSection) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (264px width) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[264px] lg:sticky lg:top-0 lg:h-screen shrink-0 bg-white border-l border-slate-200 overflow-y-auto">
        <div className="h-[57px] px-5 flex items-center border-b border-slate-200 shrink-0">
          <span
            dir="ltr"
            className="text-sm font-bold tracking-tight text-slate-900 font-display whitespace-nowrap truncate"
          >
            Telegram Knowledge Engine
          </span>
        </div>

        <nav aria-label="ناوبری اصلی" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            let count: number | null = null;
            if (overview) {
              if (item.id === 'search') count = overview.stats.totalMessages;
              else if (item.id === 'chats') count = overview.stats.totalChats;
              else if (item.id === 'knowledge') count = overview.stats.importantMessages;
              else if (item.id === 'sync') count = overview.stats.outboxPending;
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {count !== null && (
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      active ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {overview && (
          <div className="p-4 border-t border-slate-200 space-y-1.5 text-xs text-slate-500">
            <div className="font-medium text-slate-800">آرشیو متنی محلی (SQLite + FTS5)</div>
            <div className="flex items-center justify-between tabular-nums">
              <span>حجم دیتابیس:</span>
              <span dir="ltr" className="font-mono">{formatBytes(overview.stats.dbSizeBytes)}</span>
            </div>
            <div className="flex items-center justify-between tabular-nums">
              <span>ایندکس FTS5:</span>
              <span>
                <span className="font-mono">{overview.stats.ftsRowCount}</span> پیام
              </span>
            </div>
            <div className="text-[11px] text-slate-400 pt-1">
              حالت Text-Only · بدون دانلود رسانه
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-72 max-w-[82vw] bg-white h-full border-l border-slate-200 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
              <span dir="ltr" className="text-sm font-bold text-slate-900 font-display">
                Telegram Knowledge Engine
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="بستن منو"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav aria-label="ناوبری موبایل" className="p-3 space-y-1 flex-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-md transition-colors ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on right, 1 primary action on left */}
        <header className="h-[57px] bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="بازکردن منوی اصلی"
              className="lg:hidden p-2 -mr-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 truncate">
              <span className="hidden sm:inline">آرشیو شخصی تلگرام</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {currentNav.breadcrumb}
              </h1>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            {activeSection !== 'chats' ? (
              <button
                type="button"
                onClick={() => setActiveSection('chats')}
                className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                دریافت و درون‌ریزی تاریخچه
              </button>
            ) : (
              <button
                type="button"
                onClick={handleQuickExportJson}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                خروجی JSON آرشیو
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0">
          {loading && !overview && (
            <div className="p-8 space-y-4 max-w-5xl mx-auto">
              <div className="h-10 bg-white border border-slate-200 rounded-lg animate-pulse" />
              <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
            </div>
          )}

          {error && !overview && (
            <div className="m-6 p-5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-2">
              <div className="font-semibold">خطا در بارگذاری موتور آرشیو</div>
              <div>{error}</div>
              <button
                type="button"
                onClick={loadOverview}
                className="px-3 py-1.5 bg-red-700 text-white rounded-md"
              >
                تلاش مجدد
              </button>
            </div>
          )}

          {overview && activeSection === 'search' && (
            <SearchWorkspace
              chats={overview.chats}
              tags={overview.tags}
              users={overview.users}
              initialChatId={jumpToChatId}
              onClearInitialChat={() => setJumpToChatId(null)}
              onStatsUpdated={handleStatsUpdated}
              onTagsUpdated={handleTagsUpdated}
            />
          )}

          {overview && activeSection === 'chats' && (
            <ChatsManagerView
              chats={overview.chats}
              onChatsUpdated={handleChatsUpdated}
              onFullRefresh={loadOverview}
              onOpenChatInSearch={handleOpenChatInSearch}
            />
          )}

          {overview && activeSection === 'knowledge' && (
            <KnowledgeHubView tags={overview.tags} stats={overview.stats} />
          )}

          {overview && activeSection === 'sync' && (
            <CloudSyncView
              stats={overview.stats}
              settings={overview.settings}
              onStatsAndSettingsUpdated={handleStatsAndSettingsUpdated}
            />
          )}

          {overview && activeSection === 'settings' && (
            <SettingsFoundationView
              stats={overview.stats}
              settings={overview.settings}
              integrity={overview.integrity}
              onUpdated={handleStatsAndSettingsUpdated}
            />
          )}
        </main>
      </div>
    </div>
  );
}
