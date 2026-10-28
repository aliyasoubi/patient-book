import { addDays, addMonths, endOfMonth, startOfMonth } from 'date-fns-jalali';

import {
  FollowUpStatus,
  JalaliDate,
  storedDate,
  SurgeryStatus,
} from '../../domain';

/**
 * Where a row's follow-up stands, judged against today on the Jalali
 * calendar: `due` this month, `overdue` before it, `pending` after it,
 * `booked` once the patient has an appointment, `declined` once they cancel,
 * `none` when no follow-up was set or the surgery was cancelled.
 */
export type FollowUpState =
  'none' | 'pending' | 'due' | 'overdue' | 'booked' | 'declined';

/**
 * The questions staff ask of the list. Most are a window over the *open*
 * follow-ups, `pending` being every open one whatever its date; `booked` and
 * `declined` instead list the ones that have been settled either way.
 */
export const FOLLOW_UP_FILTERS = [
  'callsToday',
  'pending',
  'week',
  'thisMonth',
  'nextMonth',
  'overdue',
  'booked',
  'declined',
] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

/** The filters that list settled follow-ups instead of open ones. */
export function settledStatusOf(filter: FollowUpFilter): FollowUpStatus | null {
  if (filter === 'booked') return FollowUpStatus.Booked;
  if (filter === 'declined') return FollowUpStatus.Declined;
  return null;
}

/**
 * SQL for "this row has an open follow-up", over `surgery_queue` aliased as
 * `alias`. A cancelled surgery implies no follow-up, whatever its date says.
 * Shared so the list, the dashboard counts and its panel select alike.
 */
export function openFollowUpSql(alias: string): string {
  return `${alias}."followUpDate" IS NOT NULL AND ${alias}."followUpStatus" = '${FollowUpStatus.Open}' AND ${alias}.status <> '${SurgeryStatus.Cancelled}'`;
}

/**
 * SQL for "call this patient today", over `surgery_queue` aliased as
 * `alias`: an open follow-up due this month or before, unless a call put the
 * next one off to a later day — and any whose next call is due, whenever its
 * follow-up falls. `today` and `monthEnd` name ISO-date parameters. Shared so
 * the list's chip and the dashboard's tile count the same rows.
 */
export function callsTodaySql(
  alias: string,
  today: string,
  monthEnd: string,
): string {
  const s = alias;
  return `${openFollowUpSql(s)} AND (
    (${s}."followUpDate" <= ${monthEnd}
      AND (${s}."nextContactAt" IS NULL OR ${s}."nextContactAt" <= ${today}))
    OR ${s}."nextContactAt" <= ${today})`;
}

/** Today and the last day of this Jalali month, as `callsTodaySql` takes them. */
export function callsTodayBounds(now = new Date()): {
  today: string;
  monthEnd: string;
} {
  return { today: iso(now), monthEnd: iso(endOfMonth(now)) };
}

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
    case 'callsToday':
    case 'pending':
    case 'booked':
    case 'declined':
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
  item: {
    followUpDate: Date | null;
    followUpStatus: FollowUpStatus;
    status?: SurgeryStatus;
  },
  now = new Date(),
): FollowUpState {
  if (!item.followUpDate || item.status === SurgeryStatus.Cancelled) {
    return 'none';
  }
  if (item.followUpStatus === FollowUpStatus.Booked) return 'booked';
  if (item.followUpStatus === FollowUpStatus.Declined) return 'declined';
  const due = iso(storedDate(item.followUpDate));
  const { from, to } = followUpWindow('thisMonth', now);
  if (due < from!) return 'overdue';
  return due <= to! ? 'due' : 'pending';
}
