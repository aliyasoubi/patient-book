import { describe, expect, it } from 'vitest';

import { formatPhone } from './phone.pipe';

/** The groups are joined by no-break spaces; compare with plain ones. */
const plain = (value: string): string => value.split(String.fromCharCode(0xa0)).join(' ');

describe('formatPhone', () => {
  it('groups a mobile 4-3-4', () => {
    expect(plain(formatPhone('09121234567'))).toBe('0912 123 4567');
  });

  it('groups a landline with its area code 3-4-4', () => {
    expect(plain(formatPhone('02122345678'))).toBe('021 2234 5678');
  });

  it('reads Persian digits and stray separators', () => {
    expect(plain(formatPhone('۰۹۱۲-۱۲۳-۴۵۶۷'))).toBe('0912 123 4567');
  });

  it('keeps the groups on one line', () => {
    expect(formatPhone('09121234567')).not.toContain(' ');
  });

  it('leaves anything else as stored, and nothing as nothing', () => {
    expect(formatPhone('123')).toBe('123');
    expect(formatPhone(null)).toBe('');
  });
});
