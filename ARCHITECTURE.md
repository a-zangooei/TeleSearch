# Telegram Knowledge Engine — مستند معماری فنی (ARCHITECTURE.md)

## ۱. تصمیم بنیادین و مرز سیستم

**Telegram Knowledge Engine** یک پلتفرم محلی و شخصی برای **آرشیو، نرمالسازی زبانی و جستوجوی متنی پیامهای تلگرام** است؛ نه دانلودکننده رسانه و نه کلاینت جایگزین تلگرام.

- **Text-Only Strict**: هیچ فایل عکس، ویدیو، صوت یا سند دانلود یا آپلود نمیشود. تنها متن پیام/کپشن، لینکهای استخراجشده، روابط پیامها (`reply_to_msg_id`، `forward_from`، `grouped_id`) و پرچم بولی `has_media` ذخیره میگردد.
- **Local-First & Cloud-Optional**: پایگاه داده اصلی (`data/database/telegram_archive.db`) روی دستگاه محلی مستقل از اینترنت و هوش مصنوعی کار میکند.
- **Single-Account First, Multi-Account Ready**: در نسخه اول یک حساب کاربری فعال است، اما کلیدهای اصلی جداول (`account_id, chat_id, message_id`) بهگونهای طراحی شدهاند که افزودن چند حساب در آینده بدون بازنویسی دیتابیس انجام شود.
- **Responsive Unified Web UI**: یک وباپلیکیشن واکنشگرا (TypeScript + Vite) برای دسکتاپ، تبلت و موبایل.

---

## ۲. لایههای چهارگانه معماری

### لایه ۱: دریافت اطلاعات (Telegram Collector — Local Only)
- **فناوری**: Python 3.13/3.14 + `Telethon` (MTProto Async)
- **مسئولیتها**:
  - احراز هویت محلی و نگهداری فایل `.session` منحصراً روی دیسک محلی (هرگز به Cloud ارسال نمیشود).
  - دریافت گفتگوهای قابلدسترسی و تاریخچه پیامها بهصورت دستهای (Batch Streaming) همراه با ثبت `Checkpoint`.
  - دریافت رویدادهای زنده (`NewMessage`, `MessageEdited`, `MessageDeleted`) و تطبیق مجدد (`Reconciliation`) پس از قطعی سیستم یا اینترنت.
  - مدیریت خطای `FloodWaitError` مطابق زمان اعلامی تلگرام.

### لایه ۲: هسته مدیریت دانش و جستوجو (Knowledge Engine Core)
- **فناوری**: SQLite (WAL Mode) + `FTS5` Virtual Index + API محلی
- **مسئولیتها**:
  - نگهداری متن اصلی دستنخورده (`text`) در کنار متن نرمالشده (`normalized_text`).
  - نرمالسازی فارسی: تبدیل `ي/ى` به `ی`، `ك` به `ک`، حذف اعراب و کشیده (`ـ`)، و یکسانسازی هوشمند نیمفاصله در ایندکس جستوجو بدون تخریب متن اصلی.
  - مدیریت اهمیت شخصی (`is_important`)، برچسبها (`tags`, `message_tags`)، یادداشتهای شخصی (`personal_notes`) و استخراج خودکار لینکها (`message_links`).

### لایه ۳: موتور همگامسازی ابری (Sync Engine & Outbox)
- **الگو**: Transactional Outbox (`sync_outbox`) + Idempotency Key (`account_id:chat_id:message_id:op:vN`)
- **استقلال مفاهیم**: علامتگذاری پیام بهعنوان مهم (`is_important`) از سیاست انتقال گفتگو (`LOCAL_ONLY`, `ALL_MESSAGES`, `IMPORTANT_ONLY`, `CUSTOM_RULES`) کاملاً مستقل است.
- **قابلیت بازیابی**: قطعی اینترنت یا خطای سرویس ابری هیچگاه دریافت پیام از تلگرام را متوقف نمیکند.

### لایه ۴: دسترسی و استقرار (Provider-Independent Adapters)
- قرارداد یکسان `CloudStorageProvider` برای پشتیبانی از:
  1. اجرای محلی (`127.0.0.1` / شبکه خانگی LAN)
  2. شبکه خصوصی (`Tailscale` / WireGuard)
  3. استقرار ابری سبک (`Cloudflare Workers + D1 + Pages`)
  4. سرور شخصی (`Self-hosted VPS + Docker`)

---

## ۳. طرحواره پایگاه داده (SQLite + FTS5)

کلید یکتای پیام در سراسر سیستم:
`PRIMARY KEY (account_id, chat_id, message_id)`

جداول اصلی:
- `accounts`: شناسه حساب محلی تلگرام (آماده توسعه چندحسابی)
- `chats`: مشخصات گفتگو، وضعیت آرشیو و سیاست `sync_policy`
- `users`: شناسه پایدار فرستنده (`user_id`) مستقل از تغییر نام نمایشی یا نام کاربری
- `messages`: متن اصلی، متن نرمالشده، روابط Reply/Forward، پرچم `has_media`، `is_important` و `cloud_status`
- `fts_messages`: جدول مجازی `FTS5` هماهنگ با جدول پیامها با قابلیت بازسازی کامل (`Rebuild FTS5`)
- `message_links`, `tags`, `message_tags`, `personal_notes`
- `sync_state`: ذخیره آخرین `checkpoint_msg_id` برای ادامه دریافت تاریخچه پس از توقف
- `sync_outbox` و `sync_history`: صف انتقال ابری و گزارش عملیات

---

## ۴. مرزهای امنیتی و پشتیبانگیری

1. فایلهای `.env`، `*.session` و پوشه `data/` در `.gitignore` قرار دارند و هرگز وارد مخزن کد نمیشوند.
2. پشتیبانگیری از پایگاه داده زنده SQLite با دستور اتمی `VACUUM INTO` و بررسی سلامت با `PRAGMA integrity_check` انجام میشود؛ نه کپیکردن خام فایل هنگام نوشتن.
3. لاگهای سیستم شامل زمان، ماژول، نوع عملیات و شناسه گفتگو/پیام هستند و هرگز متن خصوصی پیامها یا توکنهای احراز هویت را ثبت نمیکنند.
