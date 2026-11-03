import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFtsQuery,
  buildIndexableNormalizedText,
  extractLinks,
  normalizePersianText,
} from './normalization';
import {
  buildIdempotencyKey,
  computeInitialCloudStatus,
  parseTelegramExportJson,
  shouldSyncMessageToCloud,
} from './syncPolicy';
import {
  ChatType,
  CloudStatus,
  OutboxOperation,
  SearchMode,
  SyncPolicy,
} from './types';

test('Persian normalization unifies Arabic Yeh/Kaf and diacritics while leaving original intact', () => {
  const arabicVariant = 'كِتابُ فيزيولوژي كليه';
  const persianVariant = 'کتاب فیزیولوژی کلیه';
  assert.equal(normalizePersianText(arabicVariant), normalizePersianText(persianVariant));
  assert.equal(arabicVariant, 'كِتابُ فيزيولوژي كليه');
});

test('Persian normalization unifies half-space, spaced, and joined verbal prefixes (می‌روم / می روم / میروم)', () => {
  const withZwnj = 'من به دانشگاه می‌روم';
  const withSpace = 'من به دانشگاه می روم';
  const joined = 'من به دانشگاه میروم';

  const n1 = normalizePersianText(withZwnj);
  const n2 = normalizePersianText(withSpace);
  const n3 = normalizePersianText(joined);

  assert.equal(n1, n2);
  assert.equal(n2, n3);
  assert.equal(n1, 'من به دانشگاه میروم');
});

test('Indexable normalized text bridges ZWNJ compounds across all 3 forms', () => {
  const indexed = buildIndexableNormalizedText('طراحی نرم‌افزار آرشیو پیام‌ها');
  assert.ok(indexed.includes('نرمافزار'));
  assert.ok(indexed.includes('نرم افزار'));
  assert.ok(indexed.includes('پیامها'));
});

test('FTS5 query builder handles simple, multi-word, exact phrase, prefix, and punctuation safely', () => {
  const multi = buildFtsQuery('فیزیولوژی کلیه', SearchMode.FLEXIBLE);
  assert.equal(multi, 'normalized_text : "فیزیولوژی" AND normalized_text : "کلیه"');

  const exactPhrase = buildFtsQuery('"چرخه اوره" فیزیولو*', SearchMode.FLEXIBLE);
  assert.equal(
    exactPhrase,
    'normalized_text : "چرخه اوره" AND normalized_text : "فیزیولو"*'
  );

  const exactMode = buildFtsQuery('"می‌روم"', SearchMode.EXACT);
  assert.equal(exactMode, 'text : "می‌روم"');

  // Unbalanced quotes or special FTS operators must not produce invalid syntax
  const unsafe = buildFtsQuery('python (asyncio) OR "unclosed: *?!', SearchMode.FLEXIBLE);
  assert.ok(unsafe.includes('normalized_text : "python"'));
  assert.ok(!unsafe.includes('('));
});

test('URL extractor extracts deduplicated HTTP/HTTPS links and strips trailing Persian punctuation', () => {
  const sample =
    'مطالعه مقاله https://pubmed.ncbi.nlm.nih.gov/38102910/، و مستندات https://www.sqlite.org/fts5.html! همچنین https://www.sqlite.org/fts5.html';
  const links = extractLinks(sample);
  assert.equal(links.length, 2);
  assert.deepEqual(links[0], {
    url: 'https://pubmed.ncbi.nlm.nih.gov/38102910/',
    domain: 'pubmed.ncbi.nlm.nih.gov',
  });
  assert.deepEqual(links[1], {
    url: 'https://www.sqlite.org/fts5.html',
    domain: 'sqlite.org',
  });
});

test('Sync policy strictly separates personal importance (isImportant) from LOCAL_ONLY policy', () => {
  const localImportant = shouldSyncMessageToCloud({
    syncPolicy: SyncPolicy.LOCAL_ONLY,
    customRule: null,
    isImportant: true,
    text: 'یادداشت محرمانه پزشکی',
    tags: ['مهم'],
    senderId: 100,
  });
  assert.equal(localImportant, false);
  assert.equal(computeInitialCloudStatus(localImportant), CloudStatus.NOT_SELECTED);

  const importantPolicyMatch = shouldSyncMessageToCloud({
    syncPolicy: SyncPolicy.IMPORTANT_ONLY,
    customRule: null,
    isImportant: true,
    text: 'یادداشت منتخب برای فضای ابری',
    tags: [],
    senderId: 100,
  });
  assert.equal(importantPolicyMatch, true);
  assert.equal(computeInitialCloudStatus(importantPolicyMatch), CloudStatus.PENDING);

  const customRuleLink = shouldSyncMessageToCloud({
    syncPolicy: SyncPolicy.CUSTOM_RULES,
    customRule: { requireLink: true, keywords: ['کلیه'] },
    isImportant: false,
    text: 'مقاله جدید فیزیولوژی كليه در https://doi.org/10.1000/xyz123 منتشر شد',
    tags: [],
    senderId: 42,
  });
  assert.equal(customRuleLink, true);
});

test('Idempotency key encodes account, chat, message, operation, and version deterministically', () => {
  const key = buildIdempotencyKey(1, -100192837, 405, OutboxOperation.UPSERT, 2);
  assert.equal(key, '1:-100192837:405:UPSERT:v2');
});

test('Telegram Desktop JSON parser extracts text and rich entities while ignoring media files', () => {
  const rawExport = JSON.stringify({
    name: 'کانال علوم اعصاب',
    type: 'public_channel',
    id: 998877,
    messages: [
      {
        id: 1,
        type: 'service',
        action: 'create_channel',
      },
      {
        id: 10,
        type: 'message',
        date: '2026-05-12T14:20:00',
        from: 'دکتر رضایی',
        from_id: 'user501',
        photo: 'photos/photo_1@12-05-2026.jpg',
        text: [
          'خلاصه مقاله ',
          { type: 'bold', text: 'حافظه بلندمدت' },
          ' در ',
          { type: 'text_link', text: 'Nature', href: 'https://nature.com/articles/s41586' },
        ],
      },
    ],
  });

  const parsed = parseTelegramExportJson(rawExport);
  assert.equal(parsed.chatId, 998877);
  assert.equal(parsed.chatType, ChatType.CHANNEL);
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0].messageId, 10);
  assert.equal(parsed.messages[0].hasMedia, true);
  assert.ok(parsed.messages[0].text.includes('حافظه بلندمدت'));
  assert.ok(parsed.messages[0].text.includes('https://nature.com/articles/s41586'));
  assert.ok(!parsed.messages[0].text.includes('photos/photo_1'));
});
