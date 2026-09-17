import { describe, expect, it } from '@jest/globals';

import { countByJalaliMonth } from './stats.service';

describe('countByJalaliMonth', () => {
  it('splits a Gregorian month across the two Jalali months it straddles', () => {
    // 1 Mehr 1404 is 23 September 2025: September belongs to Shahrivar up to
    // the 22nd and to Mehr from the 23rd. Grouping by Gregorian month would
    // have put all four of these under one label.
    const result = countByJalaliMonth([
      new Date(2025, 8, 5),
      new Date(2025, 8, 22),
      new Date(2025, 8, 23),
      new Date(2025, 8, 30),
    ]);

    expect(result).toEqual([
      { month: '1404/06', count: 2 },
      { month: '1404/07', count: 2 },
    ]);
  });

  it('orders months oldest first across a year boundary', () => {
    const result = countByJalaliMonth([
      new Date(2025, 3, 10), // 1404/01
      new Date(2025, 2, 10), // 1403/12
      new Date(2025, 3, 11), // 1404/01
    ]);

    expect(result.map((r) => r.month)).toEqual(['1403/12', '1404/01']);
    expect(result[1].count).toBe(2);
  });

  it('accepts the strings the driver returns for a date column', () => {
    expect(countByJalaliMonth(['2025-09-23'])).toEqual([
      { month: '1404/07', count: 1 },
    ]);
  });
});
