import { addDays, differenceInCalendarDays } from 'date-fns-jalali';

import { JalaliDate, storedDate } from '../../domain';

/**
 * Where a case's work is now, which is also whose move it is: the lab's while
 * it is `at_lab`, the front desk's (book the patient) once it is `at_clinic`,
 * nobody's once `delivered`. These are the board's three columns.
 */
export const LAB_STAGES = ['at_lab', 'at_clinic', 'delivered'] as const;
export type LabStage = (typeof LAB_STAGES)[number];

/** A trip out, judged against the day the lab said it would be back. */
export type LabTimeliness = 'on_time' | 'due_today' | 'overdue';

interface TripLike {
  sequence: number;
  receivedAt: Date | string | null;
}

/** The trip that is out at the lab now, if any — there is never more than one. */
export function openTrip<T extends TripLike>(trips: readonly T[]): T | null {
  return trips.find((t) => !t.receivedAt) ?? null;
}

/** The most recent trip: the one out now, or the last to come back. */
export function latestTrip<T extends TripLike>(trips: readonly T[]): T | null {
  return trips.reduce<T | null>(
    (latest, t) => (!latest || t.sequence > latest.sequence ? t : latest),
    null,
  );
}

export function labStage(c: {
  deliveredAt: Date | string | null;
  trips: readonly TripLike[];
}): LabStage {
  if (c.deliveredAt) return 'delivered';
  return openTrip(c.trips) ? 'at_lab' : 'at_clinic';
}

/** The day a trip is due back: the day it left plus the lab's turnaround. */
export function expectedReturn(sentAt: Date | string, waitDays: number): Date {
  return addDays(storedDate(sentAt), waitDays);
}

/**
 * Due today is still on time — the courier may yet come — but worth a look;
 * from the next day it is overdue and someone should call the lab.
 */
export function timeliness(
  expectedAt: Date | string,
  now = new Date(),
): { state: LabTimeliness; daysLate: number } {
  const days = differenceInCalendarDays(now, storedDate(expectedAt));
  if (days > 0) return { state: 'overdue', daysLate: days };
  return { state: days === 0 ? 'due_today' : 'on_time', daysLate: 0 };
}

/** Today on the clinic's calendar, as the `yyyy-MM-dd` a `date` column compares with. */
export function todayIso(now = new Date()): string {
  return JalaliDate.fromDate(now)!.toIsoDate();
}

/**
 * SQL for "this case is at the lab and past its due day", over `lab_cases`
 * aliased as `alias`, with `today` the parameter holding {@link todayIso}.
 * Shared so the board's filter and the dashboard count agree with
 * {@link timeliness} to the day.
 */
export function overdueSql(alias: string, today: string): string {
  return `${alias}."deliveredAt" IS NULL AND EXISTS (
    SELECT 1 FROM lab_case_trips ot
    WHERE ot."labCaseId" = ${alias}.id AND ot."receivedAt" IS NULL
      AND ot."expectedAt" < ${today})`;
}
