import { describe, expect, it } from 'vitest';

import { daysUntil, followUpDistance, followUpProgress } from './follow-up-distance';

describe('daysUntil', () => {
  const today = new Date(2026, 9, 9, 15, 30);

  it('counts whole days whatever the hour', () => {
    expect(daysUntil('2026-10-09', today)).toBe(0);
    expect(daysUntil('2026-10-10', today)).toBe(1);
    expect(daysUntil('2026-10-02', today)).toBe(-7);
  });
});

describe('followUpDistance', () => {
  it('says today without a count', () => {
    expect(followUpDistance(0)).toEqual({ key: 'surgery.relToday', count: null });
  });

  it('speaks in days, then weeks, then months, on either side of today', () => {
    expect(followUpDistance(5)).toEqual({ key: 'surgery.relDaysAhead', count: 5 });
    expect(followUpDistance(-13)).toEqual({ key: 'surgery.relDaysAgo', count: 13 });
    expect(followUpDistance(21)).toEqual({ key: 'surgery.relWeeksAhead', count: 3 });
    expect(followUpDistance(-30)).toEqual({ key: 'surgery.relWeeksAgo', count: 4 });
    expect(followUpDistance(90)).toEqual({ key: 'surgery.relMonthsAhead', count: 3 });
    expect(followUpDistance(-65)).toEqual({ key: 'surgery.relMonthsAgo', count: 2 });
  });
});

describe('followUpProgress', () => {
  const today = new Date(2026, 9, 9);

  it('is the share of the wait that has passed', () => {
    // Surgery 40 days ago, due in 60: two fifths of the wait is gone.
    expect(followUpProgress('2026-08-30', '2026-12-08', today)).toBeCloseTo(0.4, 2);
  });

  it('stays within 0 and 1 on either side of the wait', () => {
    expect(followUpProgress('2026-10-20', '2027-01-20', today)).toBe(0);
    expect(followUpProgress('2026-04-01', '2026-07-01', today)).toBe(1);
  });

  it('counts a follow-up on the surgery day as complete', () => {
    expect(followUpProgress('2026-10-01', '2026-10-01', today)).toBe(1);
  });
});
