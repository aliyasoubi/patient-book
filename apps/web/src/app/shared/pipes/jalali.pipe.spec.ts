import { describe, expect, it } from 'vitest';

import { jalaliStamp } from './jalali.pipe';

describe('jalaliStamp', () => {
  it('writes the Jalali day and the time, in Persian digits', () => {
    // Local time, so the test reads the same in any time zone.
    expect(jalaliStamp('2026-10-19T14:32:00')).toBe('۱۴۰۵/۰۷/۲۷ ۱۴:۳۲');
  });

  it('tells apart two edits on different days', () => {
    expect(jalaliStamp('2026-10-19T09:05:00')).not.toBe(jalaliStamp('2026-10-20T09:05:00'));
  });

  it('shows a dash for a moment it cannot read', () => {
    expect(jalaliStamp(null)).toBe('—');
    expect(jalaliStamp('not a date')).toBe('—');
  });
});
