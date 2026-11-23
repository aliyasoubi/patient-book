import { differenceInCalendarDays, format, isValid } from 'date-fns-jalali';

import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../core/jalali/jalali-date-adapter';

/**
 * How current a price is. The clinic reprices once a year as a rule, every
 * six or even three months when it must: a price is fresh within the
 * shortest of those, settled after it, and overdue past the year.
 */
export type PriceAge = 'fresh' | 'aging' | 'stale';

const FRESH_DAYS = 90;
const STALE_DAYS = 365;

/** The day a price was set, as a desk calendar shows it, and how long ago that was. */
export interface PriceDate {
  /** Jalali day of the month, month and year. */
  day: number;
  monthKey: string;
  year: number;
  weekdayKey: string;
  /** Whole days since, by the calendar: today is 0. */
  days: number;
  age: PriceAge;
  /** «امروز», «۳ روز پیش»: a dictionary key and its count. */
  ago: { key: string; count: number };
}

/** «Today», «yesterday», then days, weeks, months and years — as far as a person rounds. */
export function agoOf(days: number): { key: string; count: number } {
  if (days <= 0) return { key: 'tariffs.agoToday', count: 0 };
  if (days === 1) return { key: 'tariffs.agoYesterday', count: 1 };
  if (days < 14) return { key: 'tariffs.agoDays', count: days };
  if (days < 60) return { key: 'tariffs.agoWeeks', count: Math.floor(days / 7) };
  if (days < 365) return { key: 'tariffs.agoMonths', count: Math.floor(days / 30) };
  return { key: 'tariffs.agoYears', count: Math.floor(days / 365) };
}

export function priceDate(iso: string | null, now: Date = new Date()): PriceDate | null {
  const date = iso ? new Date(iso) : null;
  if (!date || !isValid(date)) return null;
  const days = Math.max(0, differenceInCalendarDays(now, date));
  return {
    day: Number(format(date, 'd')),
    monthKey: JALALI_MONTH_KEYS[Number(format(date, 'M')) - 1],
    year: Number(format(date, 'yyyy')),
    weekdayKey: `day.${JALALI_WEEKDAY_KEYS[date.getDay()]}`,
    days,
    age: days <= FRESH_DAYS ? 'fresh' : days <= STALE_DAYS ? 'aging' : 'stale',
    ago: agoOf(days),
  };
}
