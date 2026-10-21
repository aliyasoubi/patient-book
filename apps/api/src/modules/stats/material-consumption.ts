import {
  addMonths,
  format,
  getDate,
  startOfDay,
  startOfMonth,
} from 'date-fns-jalali';

/** The windows the consumption table offers, in months. */
export const CONSUMPTION_MONTHS = [6, 12] as const;
export type ConsumptionMonths = (typeof CONSUMPTION_MONTHS)[number];

/** One column of the consumption table: a Jalali month, and how much of it is on record. */
export interface ConsumptionMonth {
  /** `yyyy/MM` on the Jalali calendar. */
  month: string;
  /**
   * Stock was being recorded in this month. A month before the first stock
   * card line has no figures at all — unknown, not zero.
   */
  tracked: boolean;
  /** The day of the month recording began, when it began after the 1st. */
  trackedFromDay: number | null;
  /** This month, still running. */
  current: boolean;
}

/**
 * The months a consumption table covers: the last `count` Jalali months up to
 * this one, with the instants they start at — local midnight on the 1st, in
 * the clinic's time zone, which the API runs in — and the instant the window
 * ends, the start of next month.
 */
export function consumptionWindow(
  now: Date,
  count: number,
  trackedFrom: Date | null,
): { months: ConsumptionMonth[]; starts: Date[]; end: Date } {
  const thisMonth = startOfMonth(now);
  const starts = Array.from({ length: count }, (_, i) =>
    addMonths(thisMonth, i - (count - 1)),
  );
  const end = addMonths(thisMonth, 1);
  const firstDay = trackedFrom ? startOfDay(trackedFrom) : null;
  const months = starts.map((start, i) => {
    const next = starts[i + 1] ?? end;
    const tracked = firstDay !== null && firstDay < next;
    const partial = tracked && firstDay > start;
    return {
      month: format(start, 'yyyy/MM'),
      tracked,
      trackedFromDay: partial ? getDate(firstDay) : null,
      current: i === count - 1,
    };
  });
  return { months, starts, end };
}

/**
 * A month's usage on average, over the complete months on record only: the
 * running month and a month recording began part-way through would pull it
 * down, so they are left out — the usual rule for a consumption average.
 * Null until a whole month has been recorded.
 */
export function monthlyAverage(
  used: readonly number[],
  months: readonly ConsumptionMonth[],
): number | null {
  const complete = used.filter((_, i) => {
    const m = months[i];
    return m.tracked && m.trackedFromDay === null && !m.current;
  });
  if (!complete.length) return null;
  const total = complete.reduce((sum, n) => sum + n, 0);
  return Math.round((total / complete.length) * 10) / 10;
}
