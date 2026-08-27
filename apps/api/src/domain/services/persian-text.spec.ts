import {
  loosePersianKey,
  normalizeForDisplay,
  normalizePersian,
  searchKey,
  toLatinDigits,
  toPersianDigits,
} from './persian-text';

describe('normalizeForDisplay', () => {
  it('preserves the spelling a patient wrote their name with', () => {
    // The search folder collapses ALEF WITH MADDA to plain ALEF; storage must not.
    expect(normalizeForDisplay('آزمون تستی')).toBe('آزمون تستی');
    expect(normalizeForDisplay('أحمد')).toBe('أحمد');
    expect(normalizeForDisplay('فاطمة')).toBe('فاطمة');
  });

  it('repairs Arabic keyboard artefacts for letters Persian spells differently', () => {
    expect(normalizeForDisplay('كريمي')).toBe('کریمی');
  });

  it('keeps the half-space, which is orthographically meaningful', () => {
    expect(normalizeForDisplay('می‌شود')).toBe('می‌شود');
    expect(normalizeForDisplay('می ‌ شود')).toBe('می‌شود');
  });

  it('strips tatweel padding and collapses whitespace', () => {
    expect(normalizeForDisplay('عــلی')).toBe('علی');
    expect(normalizeForDisplay('  زهرا   محمدی  ')).toBe('زهرا محمدی');
  });

  it('never erases a Persian name', () => {
    // Guards a regression where a character class meant as "whitespace" spanned
    // the whole Arabic block and silently returned an empty string.
    for (const name of ['علی', 'زهرا محمدی', 'مریم', 'آرش', 'کیوان دماوندی']) {
      expect(normalizeForDisplay(name).length).toBeGreaterThan(0);
    }
  });
});

describe('normalizePersian / searchKey', () => {
  it('folds spellings a receptionist would consider the same name', () => {
    expect(searchKey('آزمون')).toBe(searchKey('ازمون'));
    expect(searchKey('كريمي')).toBe(searchKey('کریمی'));
    expect(searchKey('فاطمة')).toBe(searchKey('فاطمه'));
  });

  it('is idempotent', () => {
    const once = normalizePersian('كريمي  آزمون');
    expect(normalizePersian(once)).toBe(once);
  });

  it('never returns empty for non-empty Persian input', () => {
    expect(searchKey('محمدی').length).toBeGreaterThan(0);
  });

  it('handles null and empty input', () => {
    expect(normalizePersian(null)).toBe('');
    expect(normalizePersian(undefined)).toBe('');
    expect(searchKey('')).toBe('');
  });
});

describe('loosePersianKey', () => {
  it('matches names written with and without a separating space', () => {
    expect(loosePersianKey('علی رضا')).toBe(loosePersianKey('علیرضا'));
  });
});

describe('digit conversion', () => {
  it('converts Persian and Arabic-Indic digits to ASCII', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('round-trips through the Persian forms', () => {
    expect(toLatinDigits(toPersianDigits('1405'))).toBe('1405');
  });

  it('lets a query typed in Persian digits match data stored in ASCII', () => {
    expect(searchKey('۰۹۱۲۲۲۱۳۰۰۸')).toBe('09122213008');
  });
});
