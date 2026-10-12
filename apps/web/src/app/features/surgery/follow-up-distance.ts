/**
 * How far a follow-up date is from today, in the unit a receptionist would
 * say it in: days up to two weeks, weeks up to two months, months beyond.
 * `key` is the i18n key and `count` its parameter; today has no count.
 */
export interface FollowUpDistance {
  key: string;
  count: number | null;
}

const DAY_MS = 86_400_000;

/** Whole days from `today` to the ISO date `iso` (`yyyy-MM-dd`); negative once it has passed. */
export function daysUntil(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / DAY_MS);
}

export function followUpDistance(days: number): FollowUpDistance {
  if (days === 0) return { key: 'surgery.relToday', count: null };
  const ahead = days > 0;
  const n = Math.abs(days);
  if (n < 14) return { key: ahead ? 'surgery.relDaysAhead' : 'surgery.relDaysAgo', count: n };
  if (n < 60) {
    return {
      key: ahead ? 'surgery.relWeeksAhead' : 'surgery.relWeeksAgo',
      count: Math.round(n / 7),
    };
  }
  return {
    key: ahead ? 'surgery.relMonthsAhead' : 'surgery.relMonthsAgo',
    count: Math.round(n / 30),
  };
}

/**
 * How much of the wait between the surgery and its follow-up has gone, from 0
 * to 1: the fill of the card's progress bar. A follow-up that falls on the
 * surgery day has no wait to measure and counts as complete.
 */
export function followUpProgress(
  surgeryIso: string,
  followUpIso: string,
  today = new Date(),
): number {
  const total = daysUntil(followUpIso, today) - daysUntil(surgeryIso, today);
  if (total <= 0) return 1;
  const elapsed = -daysUntil(surgeryIso, today);
  return Math.min(1, Math.max(0, elapsed / total));
}
