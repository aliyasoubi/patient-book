/**
 * Persian/Arabic text normalisation — a domain rule, not a utility.
 *
 * How this practice's records decide that two spellings are the same person is
 * knowledge about the domain, so it lives here with no framework imports and no
 * I/O. Everything below is a pure function of its input.
 *
 * Real-world Persian data mixes Arabic and Persian codepoints for what users
 * read as the same letter, three different digit sets, optional diacritics and
 * the zero-width non-joiner. Two strings that look identical on screen can
 * therefore differ byte-for-byte, which silently breaks equality checks,
 * sorting and search.
 *
 * Two normalisers live here and they are **not** interchangeable:
 *
 *   `normalizeForDisplay` — for values that get stored and shown back. Repairs
 *     keyboard artefacts only; never alters how a name is spelled.
 *   `normalizePersian` / `searchKey` — for the search column. Deliberately
 *     lossy, so ALEF WITH MADDA and plain ALEF land in the same bucket.
 *
 * Every character class below is written with explicit \uXXXX escapes. A
 * literal range that reads as "whitespace" can silently span the whole Arabic
 * block and erase every Persian name it touches.
 */

/** Arabic to Persian letter folding. Search only — see the note above. */
const LETTER_MAP: Record<string, string> = {
  ي: 'ی', // ARABIC YEH            -> FARSI YEH
  ى: 'ی', // ALEF MAKSURA          -> FARSI YEH
  ے: 'ی', // YEH BARREE            -> FARSI YEH
  ئ: 'ی', // YEH WITH HAMZA ABOVE  -> FARSI YEH
  ك: 'ک', // ARABIC KAF            -> KEHEH
  ڪ: 'ک', // SWASH KAF             -> KEHEH
  ة: 'ه', // TEH MARBUTA           -> HEH
  ۀ: 'ه', // HEH WITH YEH ABOVE    -> HEH
  أ: 'ا', // ALEF WITH HAMZA ABOVE -> ALEF
  إ: 'ا', // ALEF WITH HAMZA BELOW -> ALEF
  آ: 'ا', // ALEF WITH MADDA ABOVE -> ALEF
  ٱ: 'ا', // ALEF WASLA            -> ALEF
  ؤ: 'و', // WAW WITH HAMZA ABOVE  -> WAW
};

/** Persian (U+06F0..U+06F9) and Arabic-Indic (U+0660..U+0669) digits to ASCII. */
const DIGIT_RANGES: Array<[number, number]> = [
  [0x06f0, 0x06f9], // EXTENDED ARABIC-INDIC
  [0x0660, 0x0669], // ARABIC-INDIC
];

/** Combining marks (harakat), tatweel, and bidi/format controls. */
const STRIP_RE =
  /[\u064B-\u0652\u0653-\u0655\u0670\u0640\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Zero-width non-joiner and joiner: the Persian half-space and its partner. */
const ZW_JOINER_RE = /[\u200C\u200D]/g;

/**
 * Characters that collapse to a single plain space. Deliberately excludes
 * U+200C ZWNJ and U+200D ZWJ, which carry meaning in Persian, and stops the
 * range at U+200B so it can never reach into the Arabic block.
 */
const SPACE_CODEPOINTS = [
  0x0009, // TAB
  0x000a, // LF
  0x000d, // CR
  0x0020, // SPACE
  0x00a0, // NO-BREAK SPACE
  0x1680, // OGHAM SPACE MARK
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004, // EN QUAD .. THREE-PER-EM SPACE
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009, // FOUR-PER-EM .. THIN SPACE
  0x200a, // HAIR SPACE
  0x200b, // ZERO WIDTH SPACE -- U+200C ZWNJ is deliberately NOT in this list
  0x202f, // NARROW NO-BREAK SPACE
  0x205f, // MEDIUM MATHEMATICAL SPACE
  0x3000, // IDEOGRAPHIC SPACE
];

const SPACEY_RE = new RegExp(
  `[${SPACE_CODEPOINTS.map((c) => `\\u${c.toString(16).padStart(4, '0')}`).join('')}]`,
  'g',
);

/** The Arabic Unicode blocks, scanned for letter folding. */
const ARABIC_BLOCK_RE =
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;

/** Convert every Persian/Arabic digit in a string to its ASCII equivalent. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    const range = DIGIT_RANGES.find(([lo, hi]) => code >= lo && code <= hi);
    out += range ? String.fromCharCode(48 + (code - range[0])) : ch;
  }
  return out;
}

/** Convert ASCII digits to Persian digits, for display only. */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) =>
    String.fromCharCode(0x06f0 + Number(d)),
  );
}

/**
 * Clean a value for **storage and display**.
 *
 * Keeps the patient's own spelling intact: an ALEF WITH MADDA stays one, and a
 * TEH MARBUTA is not rewritten to HEH. Only genuine keyboard artefacts are
 * repaired — the Arabic YEH/KAF that Persian keyboards emit for FARSI YEH and
 * KEHEH, tatweel padding, stray bidi controls and irregular whitespace. The
 * half-space is preserved, because it distinguishes real words.
 */
export function normalizeForDisplay(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.normalize('NFC');
  s = s.replace(STRIP_RE, '');
  s = s.replace(/[يىے]/g, 'ی');
  s = s.replace(/[كڪ]/g, 'ک');
  s = s.replace(SPACEY_RE, ' ');
  s = s.replace(/ +/g, ' ');
  // A half-space should never sit beside a real space.
  s = s.replace(/ *‌ */g, '‌');
  return s.trim();
}

/**
 * Fold a string into the canonical form used for search.
 * Idempotent: `normalizePersian(normalizePersian(x)) === normalizePersian(x)`.
 */
export function normalizePersian(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.normalize('NFC');
  s = s.replace(ZW_JOINER_RE, ' ');
  s = s.replace(STRIP_RE, '');
  s = s.replace(ARABIC_BLOCK_RE, (ch) => LETTER_MAP[ch] ?? ch);
  s = toLatinDigits(s);
  s = s.replace(SPACEY_RE, ' ');
  return s.replace(/ +/g, ' ').trim();
}

/** Lowercased normal form — what actually goes into the search column. */
export function searchKey(input: string | null | undefined): string {
  return normalizePersian(input).toLowerCase();
}

/**
 * Aggressive form for de-duplication: drops every space, so a given name
 * written with and without a separating space collapses together. Too lossy
 * for search ranking, but it is what matches the same human across sheets that
 * spell the name differently.
 */
export function loosePersianKey(input: string | null | undefined): string {
  return normalizePersian(input).replace(/ /g, '').toLowerCase();
}

// -- Iranian identifiers ------------------------------------------------

/**
 * Validate an Iranian national identifier by its check digit. Codes made of
 * one repeated digit satisfy the arithmetic but are never issued.
 */
export function isValidNationalId(value: string | null | undefined): boolean {
  if (!value) return false;
  const id = toLatinDigits(value).replace(/\D/g, '');
  if (id.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(id)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(id[i]) * (10 - i);
  const remainder = sum % 11;
  const check = Number(id[9]);
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

/**
 * Left-pad a national id to 10 digits. Leading zeros are routinely lost when
 * these are typed into a spreadsheet, which is why 9-digit codes are common in
 * the source data.
 */
export function padNationalId(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length < 10 ? digits.padStart(10, '0') : digits;
}

/** Normalise an Iranian mobile number to local `09xxxxxxxxx` form. */
export function normalizeMobile(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  let d = toLatinDigits(value).replace(/[^\d+]/g, '');
  if (d.startsWith('+98')) d = '0' + d.slice(3);
  else if (d.startsWith('0098')) d = '0' + d.slice(4);
  else if (d.startsWith('98') && d.length === 12) d = '0' + d.slice(2);
  else if (d.startsWith('9') && d.length === 10) d = '0' + d;
  d = d.replace(/\D/g, '');
  return d || null;
}

/** True for a well-formed Iranian mobile number. */
export function isValidMobile(value: string | null | undefined): boolean {
  const m = normalizeMobile(value);
  return !!m && /^09\d{9}$/.test(m);
}

/** Normalise a landline: strip separators, keep digits only. */
export function normalizePhone(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const d = toLatinDigits(value).replace(/\D/g, '');
  return d || null;
}
