import { ExtractedLink, NormalizationOptions, SearchMode } from './types';

export const DEFAULT_NORMALIZATION_OPTIONS: NormalizationOptions = {
  arabicChars: true,
  stripDiacritics: true,
  unifyHalfSpace: true,
  normalizeDigits: true,
};

const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const URL_RE = /https?:\/\/[^\s<>()"'«»]+/gi;

/**
 * Normalizes Persian and English text for search without mutating the original message text.
 * Bridges Arabic/Persian character variants (ي/ی, ك/ک), diacritics, digits, and ZWNJ verbal prefixes
 * such as "می‌روم", "میروم", and "می روم".
 */
export function normalizePersianText(
  input: string,
  options: NormalizationOptions = DEFAULT_NORMALIZATION_OPTIONS
): string {
  if (!input) return '';

  let text = input.normalize('NFC');

  if (options.arabicChars) {
    text = text
      .replace(/[يیىئ]/g, 'ی')
      .replace(/[كک]/g, 'ک')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/[أإ]/g, 'ا');
  }

  if (options.stripDiacritics) {
    text = text.replace(ARABIC_DIACRITICS_RE, '');
  }

  if (options.normalizeDigits) {
    for (let i = 0; i < 10; i++) {
      text = text.replaceAll(PERSIAN_DIGITS[i], String(i));
      text = text.replaceAll(ARABIC_DIGITS[i], String(i));
    }
  }

  if (options.unifyHalfSpace) {
    // Unify Persian verbal prefixes: "می روم" / "می‌روم" -> "میروم" (excluding standalone prepositions)
    text = text.replace(
      /(^|[\s،؛.:!؟()«»"-])(ن?می)[\s\u200c]+(?=(?!در(?:\s|$)|از(?:\s|$)|به(?:\s|$)|با(?:\s|$)|را(?:\s|$)|و(?:\s|$)|که(?:\s|$))[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]{2,})/g,
      '$1$2'
    );

    // Unify Persian plural suffixes: "کتاب ها" / "کتاب‌ها" -> "کتابها"
    text = text.replace(
      /([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی])[\s\u200c]+(هایی|هایم|هایت|هایش|هایمان|هایتان|هایشان|های|ها)(?=$|[\s،؛.:!؟()«»"-])/g,
      '$1$2'
    );

    // Collapse remaining ZWNJ so joined and half-spaced compounds match ("نرم‌افزار" == "نرمافزار")
    text = text.replace(/\u200c+/g, '');
  }

  // Standardize punctuation spacing & lowercase Latin characters
  text = text
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return text;
}

/**
 * Produces the FTS5 indexable normalized representation.
 * Includes both collapsed-ZWNJ compounds and space-separated ZWNJ parts so searching
 * "نرم‌افزار", "نرمافزار", or "نرم افزار" all match cleanly.
 */
export function buildIndexableNormalizedText(
  rawText: string,
  options: NormalizationOptions = DEFAULT_NORMALIZATION_OPTIONS
): string {
  const primary = normalizePersianText(rawText, options);
  if (!rawText || !rawText.includes('\u200c')) {
    return primary;
  }

  const spacedVariant = normalizePersianText(rawText.replace(/\u200c+/g, ' '), {
    ...options,
    unifyHalfSpace: false,
  });

  if (spacedVariant && spacedVariant !== primary) {
    return `${primary} ${spacedVariant}`;
  }
  return primary;
}

/**
 * Safely parses a user search query into a valid SQLite FTS5 MATCH expression.
 * Supports:
 * - Exact quoted phrases: "چرخه اوره"
 * - Prefix queries: فیزیولو*
 * - Multi-word AND queries: فیزیولوژی کلیه
 * - Flexible mode (targets `normalized_text`) vs Exact mode (targets `text`)
 */
export function buildFtsQuery(
  rawQuery: string,
  mode: SearchMode = SearchMode.FLEXIBLE,
  options: NormalizationOptions = DEFAULT_NORMALIZATION_OPTIONS
): string {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) return '';

  const column = mode === SearchMode.EXACT ? 'text' : 'normalized_text';
  const prepared =
    mode === SearchMode.EXACT
      ? trimmed.replace(/[«»“”]/g, '"')
      : normalizePersianText(trimmed, options);

  const clauses: string[] = [];
  const tokenRegex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(prepared)) !== null) {
    if (match[1] !== undefined) {
      const phrase = sanitizeFtsToken(match[1], false);
      if (phrase) {
        clauses.push(`${column} : "${phrase}"`);
      }
    } else if (match[2] !== undefined) {
      const rawToken = match[2];
      const isPrefix = rawToken.endsWith('*') && rawToken.length > 1;
      const core = sanitizeFtsToken(isPrefix ? rawToken.slice(0, -1) : rawToken, true);
      if (core) {
        clauses.push(isPrefix ? `${column} : "${core}"*` : `${column} : "${core}"`);
      }
    }
  }

  return clauses.join(' AND ');
}

function sanitizeFtsToken(token: string, collapseSpaces: boolean): string {
  // Remove characters that break FTS5 double-quoted string literals or operator syntax
  let cleaned = token.replace(/["'^*():+\-\\/|<>[\]{}~`!@#$%&=?;،؛؟]/g, ' ');
  cleaned = collapseSpaces ? cleaned.replace(/\s+/g, '').trim() : cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Extracts valid HTTP/HTTPS URLs and their normalized domain names from message text.
 */
export function extractLinks(text: string): ExtractedLink[] {
  if (!text) return [];
  const matches = text.match(URL_RE);
  if (!matches) return [];

  const seen = new Set<string>();
  const results: ExtractedLink[] = [];

  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)،؛»"\]]+$/g, '');
    if (seen.has(cleaned)) continue;
    try {
      const parsed = new URL(cleaned);
      if (parsed.hostname) {
        seen.add(cleaned);
        results.push({
          url: cleaned,
          domain: parsed.hostname.toLowerCase().replace(/^www\./, ''),
        });
      }
    } catch {
      // Ignore malformed URLs
    }
  }

  return results;
}

/**
 * Builds a clean context snippet around matched query terms while preserving original text.
 */
export function createMessageSnippet(text: string, rawQuery?: string, maxLength = 210): string {
  if (!text) return '';
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (!rawQuery || !rawQuery.trim()) {
    return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength)}…`;
  }

  const normalizedHaystack = normalizePersianText(singleLine);
  const terms = normalizePersianText(rawQuery)
    .replace(/["*]/g, '')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let matchIndex = -1;
  for (const term of terms) {
    const idx = normalizedHaystack.indexOf(term);
    if (idx !== -1) {
      matchIndex = idx;
      break;
    }
  }

  if (matchIndex === -1 || singleLine.length <= maxLength) {
    return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength)}…`;
  }

  // Approximate character window in original string
  const ratio = matchIndex / Math.max(1, normalizedHaystack.length);
  const approxCenter = Math.floor(ratio * singleLine.length);
  const start = Math.max(0, approxCenter - Math.floor(maxLength / 2));
  const end = Math.min(singleLine.length, start + maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < singleLine.length ? '…' : '';

  return `${prefix}${singleLine.slice(start, end).trim()}${suffix}`;
}

export function buildTelegramMessageUrl(
  chatUsername: string | null,
  messageId: number
): string | null {
  if (!chatUsername || messageId <= 0) return null;
  const cleanUsername = chatUsername.replace(/^@/, '').trim();
  if (!cleanUsername) return null;
  return `https://t.me/${cleanUsername}/${messageId}`;
}
