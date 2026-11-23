import { describe, expect, it } from 'vitest';

import { agoOf, priceDate } from './price-date';

describe('priceDate', () => {
  // 2 Azar 1405, a Monday: the day the practice handed its list over.
  const handedOver = '2026-11-23T12:00:00+03:30';

  it('reads the day as a desk calendar shows it', () => {
    expect(priceDate(handedOver, new Date('2026-11-23T20:00:00+03:30'))).toMatchObject({
      day: 2,
      monthKey: 'month.azar',
      year: 1405,
      weekdayKey: 'day.monday',
      days: 0,
      age: 'fresh',
      ago: { key: 'tariffs.agoToday', count: 0 },
    });
  });

  it('ages: fresh for three months, settled to the year, overdue past it', () => {
    const after = (days: number) =>
      priceDate(handedOver, new Date(Date.parse(handedOver) + days * 86_400_000))?.age;
    expect(after(90)).toBe('fresh');
    expect(after(91)).toBe('aging');
    expect(after(365)).toBe('aging');
    expect(after(366)).toBe('stale');
  });

  it('is nothing for a date never recorded', () => {
    expect(priceDate(null)).toBeNull();
    expect(priceDate('not a date')).toBeNull();
  });
});

describe('agoOf', () => {
  it('rounds the way a person says it', () => {
    expect(agoOf(1)).toEqual({ key: 'tariffs.agoYesterday', count: 1 });
    expect(agoOf(5)).toEqual({ key: 'tariffs.agoDays', count: 5 });
    expect(agoOf(20)).toEqual({ key: 'tariffs.agoWeeks', count: 2 });
    expect(agoOf(100)).toEqual({ key: 'tariffs.agoMonths', count: 3 });
    expect(agoOf(800)).toEqual({ key: 'tariffs.agoYears', count: 2 });
  });
});
