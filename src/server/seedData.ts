import { ChatType, ImportStatus, SyncPolicy } from '../core/types';

export interface SeedChat {
  chatId: number;
  title: string;
  chatType: ChatType;
  username: string | null;
  isActive: boolean;
  syncPolicy: SyncPolicy;
  customRule: { keywords?: string[]; requireLink?: boolean; requiredTags?: string[] } | null;
  totalEstimated: number;
  importStatus: ImportStatus;
}

export interface SeedUser {
  userId: number;
  displayName: string;
  username: string | null;
}

export interface SeedMessage {
  chatId: number;
  messageId: number;
  senderId: number;
  date: string;
  editDate?: string | null;
  text: string;
  replyToMsgId?: number | null;
  forwardFromName?: string | null;
  groupedId?: string | null;
  views?: number | null;
  hasMedia?: boolean;
  isImportant?: boolean;
  tags?: string[];
  personalNote?: string | null;
}

export const INITIAL_USERS: SeedUser[] = [
  { userId: 1001, displayName: 'دکتر آرش بهرامی', username: 'dr_bahrami_med' },
  { userId: 1002, displayName: 'مهندس سارا کاظمی', username: 'sara_kazemi_dev' },
  { userId: 1003, displayName: 'امیرحسین رضوی', username: 'amir_sysarch' },
  { userId: 1004, displayName: 'علیرضا (یادداشت شخصی)', username: 'alireza_notes' },
  { userId: 1005, displayName: 'تحریریه رصدخانه علم و فناوری', username: 'tech_digest_ir' },
  { userId: 1006, displayName: 'دکتر نیما شریفی', username: 'nima_nephrology' },
];

export const INITIAL_CHATS: SeedChat[] = [
  {
    chatId: -1001450201,
    title: 'کانال فیزیولوژی و علوم پایه پزشکی',
    chatType: ChatType.CHANNEL,
    username: 'iran_physiology_archive',
    isActive: true,
    syncPolicy: SyncPolicy.ALL_MESSAGES,
    customRule: null,
    totalEstimated: 9,
    importStatus: ImportStatus.PAUSED,
  },
  {
    chatId: -1001880302,
    title: 'گروه معماری نرم‌افزار و سیستم‌های توزیع‌شده',
    chatType: ChatType.SUPERGROUP,
    username: 'distributed_systems_fa',
    isActive: true,
    syncPolicy: SyncPolicy.IMPORTANT_ONLY,
    customRule: null,
    totalEstimated: 6,
    importStatus: ImportStatus.PAUSED,
  },
  {
    chatId: 77001100,
    title: 'پیام‌های ذخیره‌شده و یادداشت‌های شخصی',
    chatType: ChatType.PRIVATE,
    username: null,
    isActive: true,
    syncPolicy: SyncPolicy.LOCAL_ONLY,
    customRule: null,
    totalEstimated: 2,
    importStatus: ImportStatus.COMPLETED,
  },
  {
    chatId: -1001990404,
    title: 'رصدخانه مقالات و مستندات فنی',
    chatType: ChatType.CHANNEL,
    username: 'papers_and_docs_ir',
    isActive: true,
    syncPolicy: SyncPolicy.CUSTOM_RULES,
    customRule: { requireLink: true },
    totalEstimated: 3,
    importStatus: ImportStatus.COMPLETED,
  },
];

export const INITIAL_MESSAGES: SeedMessage[] = [
  // Chat 1: Medical & Physiology Channel (demonstrating Arabic/Persian variants, exact phrases, replies)
  {
    chatId: -1001450201,
    messageId: 101,
    senderId: 1001,
    date: '2026-10-20T08:15:00.000Z',
    text: 'مبحث اول فیزیولوژی کلیه: نرخ فیلتراسیون گلومرولی (GFR) در یک فرد بالغ سالم حدود ۱۲۵ میلی‌لیتر در دقیقه است. تنظیم خودکار جریان خون کلیوی از طریق مکانیسم میوژنیک و بازخورد توبوگلومرولار انجام می‌شود.',
    views: 1840,
    isImportant: true,
    tags: ['فیزیولوژی', 'پزشکی'],
    personalNote: 'نکته کلیدی برای مرور فصل کلیه گایتون — رابطه فشار هیدرواستاتیک و GFR.',
  },
  {
    chatId: -1001450201,
    messageId: 102,
    senderId: 1006,
    date: '2026-10-20T09:05:00.000Z',
    replyToMsgId: 101,
    text: 'تکمیل نکته بالا درباره فيزيولوژي كليه و كتاب مرجع گایتون: در اسیدوز متابولیک مزمن، کلیه‌ها با افزایش دفع یون آمونیوم و بازجذب بی‌کربنات تعادل اسید-باز را بازمی‌گردانند. خلاصه مقاله مروری: https://pubmed.ncbi.nlm.nih.gov/37910421/',
    views: 1620,
    isImportant: false,
    tags: ['فیزیولوژی', 'مقاله'],
  },
  {
    chatId: -1001450201,
    messageId: 103,
    senderId: 1001,
    date: '2026-10-21T11:30:00.000Z',
    text: 'بررسی دقیق "چرخه اوره" در هپاتوسیت‌های کبد: آمونیاک سمی حاصل از دآمیناسیون اسیدهای آمینه طی پنج واکنش آنزیمی به اوره محلول تبدیل شده و سپس از طریق جریان خون وارد نفرون‌های کلیه می‌گردد تا دفع شود.',
    views: 2110,
    isImportant: true,
    tags: ['بیوشیمی', 'پزشکی'],
  },
  {
    chatId: -1001450201,
    messageId: 104,
    senderId: 1001,
    date: '2026-10-22T16:45:00.000Z',
    hasMedia: true,
    text: 'کپشن نمودار بازجذب سدیم در قوس هنله (نسخه متنی بدون دانلود تصویر): شاخه پایین‌رو نسبت به آب نفوذپذیر است اما شاخه بالارو ضخیم با پمپ Na-K-2Cl محیط مدولا را هیپراسمولار نگه می‌دارد.',
    views: 1495,
    tags: ['فیزیولوژی'],
  },
  {
    chatId: -1001450201,
    messageId: 105,
    senderId: 1006,
    date: '2026-10-24T07:50:00.000Z',
    replyToMsgId: 103,
    text: 'در ادامه مبحث "چرخه اوره": نقص مادرزادی آنزیم اورنیتین ترانس‌کاربامیلاز (OTC) شایع‌ترین اختلال این مسیر است که موجب هیپرآمونمی شدید می‌شود. زمانی که به بخش بالینی می روم، چک کردن سطح آمونیاک پلاسما اولین قدم تشخیصی است.',
    views: 1380,
    tags: ['بالینی', 'پزشکی'],
  },

  // Chat 2: Software Architecture Supergroup (SQLite, FTS5, Asyncio, Outbox, ZWNJ variants)
  {
    chatId: -1001880302,
    messageId: 301,
    senderId: 1002,
    date: '2026-10-25T13:10:00.000Z',
    text: 'در طراحی موتور جست‌وجوی محلی با SQLite FTS5 حتماً حالت WAL را فعال کنید تا هنگام دریافت دسته‌ای تاریخچه از Telethon، کوئری‌های خواندن رابط کاربری قفل نشوند. مستندات رسمی: https://www.sqlite.org/fts5.html',
    isImportant: true,
    tags: ['معماری', 'دیتابیس'],
    personalNote: 'الگوی پایه برای لایه Knowledge Engine و جلوگیری از قفل شدن دیسک.',
  },
  {
    chatId: -1001880302,
    messageId: 302,
    senderId: 1003,
    date: '2026-10-25T13:28:00.000Z',
    replyToMsgId: 301,
    text: 'دقیقاً! من هم وقتی سراغ پیاده‌سازی همگام‌سازی ابری می‌روم، به‌جای ارسال مستقیم در لحظه دریافت، از جدول sync_outbox و کلید idempotency استفاده می‌کنم تا قطع اینترنت هیچ اثری روی Collector نگذارد.',
    isImportant: true,
    tags: ['معماری', 'همگام‌سازی'],
  },
  {
    chatId: -1001880302,
    messageId: 303,
    senderId: 1002,
    date: '2026-10-26T18:05:00.000Z',
    editDate: '2026-10-26T18:22:00.000Z',
    replyToMsgId: 301,
    text: 'نکته تکمیلی درباره نرم‌افزار آرشیو فارسی: کاربران در تایپ روزمره شکل‌های «می‌روم»، «میروم» و «می روم» یا حروف عربی مثل «كتاب» و «کتاب» را به کار می‌برند؛ بنابراین ستون normalized_text در کنار متن اصلی ضروری است.',
    isImportant: false,
    tags: ['جست‌وجو', 'فارسی'],
  },
  {
    chatId: -1001880302,
    messageId: 304,
    senderId: 1003,
    date: '2026-10-28T10:40:00.000Z',
    text: 'برای استقرار بدون وابستگی به یک سرویس خاص، قرارداد CloudStorageProvider را طوری نوشتیم که هم با Cloudflare D1 کار کند و هم در صورت نیاز ظرف چند دقیقه روی سرور شخصی لینوکسی یا شبکه خصوصی Tailscale منتقل شود: https://developers.cloudflare.com/d1/',
    isImportant: false,
    tags: ['معماری', 'کلود'],
  },

  // Chat 3: Personal Saved Messages (LOCAL_ONLY — proving is_important stays strictly local!)
  {
    chatId: 77001100,
    messageId: 501,
    senderId: 1004,
    date: '2026-10-29T20:00:00.000Z',
    text: 'برنامه مطالعاتی آبان‌ماه: هر روز صبح قبل از اینکه به کتابخانه میروم، دو بخش از یادداشت‌های فیزیولوژی کلیه و معماری پایگاه داده SQLite را مرور کنم. این یادداشت کاملاً شخصی است و سیاست گفت‌وگو LOCAL_ONLY تنظیم شده است.',
    isImportant: true,
    tags: ['شخصی', 'برنامه‌ریزی'],
    personalNote: 'تست تفکیک اهمیت شخصی (is_important = true) از سیاست انتقال ابری (LOCAL_ONLY).',
  },
  {
    chatId: 77001100,
    messageId: 502,
    senderId: 1004,
    date: '2026-10-30T21:15:00.000Z',
    text: 'چک‌لیست امنیتی پروژه: فایل .session تلگرام و کلیدهای TG_API_HASH هرگز نباید به سرور ابری یا مخزن گیت ارسال شوند؛ پشتیبان‌گیری دیتابیس نیز فقط با دستور اتمی VACUUM INTO انجام شود.',
    isImportant: true,
    tags: ['امنیت', 'شخصی'],
  },

  // Chat 4: Tech & Papers Digest (CUSTOM_RULES: requireLink = true)
  {
    chatId: -1001990404,
    messageId: 701,
    senderId: 1005,
    date: '2026-11-01T09:30:00.000Z',
    forwardFromName: 'Python Core Releases',
    text: 'انتشار راهنمای جامع بهینه‌سازی حلقه رویداد asyncio در Python 3.13 و بررسی سازگاری کتابخانه Telethon با نسخه‌های جدید مفسر پایتون: https://docs.telethon.dev/en/stable/',
    views: 3420,
    tags: ['پایتون', 'مقاله'],
  },
  {
    chatId: -1001990404,
    messageId: 702,
    senderId: 1005,
    date: '2026-11-02T14:10:00.000Z',
    text: 'یادآوری هفتگی تحریریه: فهرست موضوعی مقالات منتخب پاییز امشب منتشر خواهد شد (این پیام فاقد لینک است؛ بنابراین تحت سیاست CUSTOM_RULES به فضای ابری ارسال نمی‌شود).',
    views: 2890,
    tags: ['اطلاعیه'],
  },
  {
    chatId: -1001990404,
    messageId: 703,
    senderId: 1005,
    date: '2026-11-02T19:45:00.000Z',
    text: 'مستندات معماری FastAPI و اعتبارسنجی مدل‌های ورودی/خروجی با Pydantic v2 برای ساخت سرویس‌های محلی و چندسکویی: https://fastapi.tiangolo.com/',
    views: 3190,
    isImportant: true,
    tags: ['پایتون', 'معماری'],
  },
];

/**
 * Staged historical batches ready for interactive Checkpoint Import testing (Pause / Resume / Batch fetch).
 */
export const STAGED_HISTORY_BATCHES: Record<number, SeedMessage[]> = {
  [-1001450201]: [
    {
      chatId: -1001450201,
      messageId: 106,
      senderId: 1001,
      date: '2026-10-26T08:00:00.000Z',
      text: 'مبحث هورمون ضدادراری (ADH / وازوپرسین): با اتصال به گیرنده‌های V2 در مجاری جمع‌کننده کلیه، کانال‌های آکواپورین-۲ را به غشای راسی منتقل کرده و غلظت ادرار را تنظیم می‌کند.',
      views: 1540,
      tags: ['فیزیولوژی', 'پزشکی'],
    },
    {
      chatId: -1001450201,
      messageId: 107,
      senderId: 1006,
      date: '2026-10-27T10:20:00.000Z',
      replyToMsgId: 106,
      text: 'مقایسه دیابت بی‌مزه مرکزی و نفروژنیک در آزمون‌های بالینی و مرور فصل کلیه از کتاب فیزیولوژی: https://pubmed.ncbi.nlm.nih.gov/36821904/',
      views: 1410,
      tags: ['بالینی', 'مقاله'],
    },
    {
      chatId: -1001450201,
      messageId: 108,
      senderId: 1001,
      date: '2026-10-28T15:00:00.000Z',
      text: 'تنظیم پتاسیم خارج‌سلولی توسط آلدوسترون در سلول‌های اصلی توبول جمع‌کننده قشری کلیه و نقش کلیدی آن در پتانسیل استراحت غشای سلول‌های قلبی.',
      views: 1690,
      tags: ['فیزیولوژی'],
    },
    {
      chatId: -1001450201,
      messageId: 109,
      senderId: 1006,
      date: '2026-10-29T11:15:00.000Z',
      text: 'جمع‌بندی سیستم رنین-آنژیوتانسین-آلدوسترون (RAAS): کاهش پرفیوژن کلیوی باعث ترشح رنین از سلول‌های جنب‌گلومرولی و تنگ‌شدن شریانچه وابران توسط آنژیوتانسین II می‌گردد.',
      views: 1930,
      isImportant: true,
      tags: ['فیزیولوژی', 'پزشکی'],
    },
  ],
  [-1001880302]: [
    {
      chatId: -1001880302,
      messageId: 305,
      senderId: 1002,
      date: '2026-10-30T09:12:00.000Z',
      text: 'آزمون بازیابی پس از قطعی برق (Recovery Test): با ذخیره checkpoint_msg_id در همان تراکنش SQLite، حتی اگر برنامه وسط دریافت ۱۰۰ هزار پیام بسته شود هیچ رکورد تکراری یا ناقصی ساخته نمی‌شود.',
      isImportant: true,
      tags: ['معماری', 'دیتابیس'],
    },
    {
      chatId: -1001880302,
      messageId: 306,
      senderId: 1003,
      date: '2026-10-31T17:40:00.000Z',
      replyToMsgId: 305,
      text: 'برای بررسی سلامت فایل پشتیبان هم بلافاصله بعد از اجرای VACUUM INTO دستور PRAGMA integrity_check را روی فایل مقصد اجرا می‌کنیم تا از صحت کامل صفحات B-Tree و FTS5 مطمئن شویم.',
      tags: ['امنیت', 'دیتابیس'],
    },
  ],
};
