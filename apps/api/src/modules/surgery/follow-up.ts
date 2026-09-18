import { addDays, addMonths, endOfMonth, startOfMonth } from 'date-fns-jalali';

import { JalaliDate } from '../../domain';

/**
 * Where a row's follow-up stands, judged against today on the Jalali
 * calendar: `due` this month, `overdue` before it, `pending` after it,
 * `done` once it has happened, `none` when no follow-up was set.
 */
export type FollowUpState = 'none' | 'pending' | 'due' | 'overdue' | 'done';

/**
 * The questions staff ask of the list, each a window over the *open*
 * follow-ups. `pending` is every open one whatever its date.
 */
export const FOLLOW_UP_FILTERS = [
  'pending',
  'week',
  'thisMonth',
  'nextMonth',
  'overdue',
] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

/** ISO `yyyy-MM-dd` bounds, inclusive, for a `date` column comparison. */
export interface DateWindow {
  from?: string;
  to?: string;
}

const iso = (d: Date): string => JalaliDate.fromDate(d)!.toIsoDate();

/**
 * The date window a filter names. One place decides what "this month" or
 * "this week" means, so the list, its counts and the dashboard agree.
 *
 * The month is the unit of work — the paper diary said "آذر ماه", not a day
 * — so a follow-up is *due* for the whole of its month and only *overdue*
 * once that month has passed. "Week" is the seven days from today: a
 * receptionist asks "who do I call this week", not "before Friday".
 */
export function followUpWindow(
  filter: FollowUpFilter,
  now = new Date(),
): DateWindow {
  switch (filter) {
    case 'pending':
      return {};
    case 'week':
      return { from: iso(now), to: iso(addDays(now, 6)) };
    case 'thisMonth':
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
    case 'nextMonth': {
      const next = addMonths(startOfMonth(now), 1);
      return { from: iso(next), to: iso(endOfMonth(next)) };
    }
    case 'overdue':
      return { to: iso(addDays(startOfMonth(now), -1)) };
  }
}

export function followUpState(
  item: { followUpDate: Date | null; followUpDoneAt: Date | null },
  now = new Date(),
): FollowUpState {
  if (!item.followUpDate) return 'none';
  if (item.followUpDoneAt) return 'done';
  const due = iso(new Date(item.followUpDate));
  const { from, to } = followUpWindow('thisMonth', now);
  if (due < from!) return 'overdue';
  return due <= to! ? 'due' : 'pending';
}
