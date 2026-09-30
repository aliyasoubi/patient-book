/**
 * LEGACY — the imported sheets recorded a prosthesis follow-up as a bare
 * Jalali month name ("آذر ماه", "اواخر مهر"). Migration
 * `BackfillSurgeryFollowUps` turned the rows already in the database into the
 * structured follow-up via {@link legacyFollowUpMonths}, and the workbook
 * importer does the same for rows it reads ({@link legacyFollowUp}). Once
 * the workbook import is retired too, this whole wrapper can go. Delete,
 * together:
 *
 *   - this file and its spec
 *   - `SurgeryQueueItem.prosthesisDue` (add a migration dropping the column)
 *   - `prosthesisDue` in the surgery response and in the web `SurgeryQueueItem`
 *   - the `LEGACY` branch in `surgery-list.html` and the `surgery.prosthesis` key
 *   - the `LEGACY` hint in `surgery-form.ts` and the `surgeryForm.followUpLegacy` key
 *
 * The migration itself stays: history has to replay.
 */
import { addMonths, getMonth } from 'date-fns-jalali';

import { JalaliDate, normalizePersian } from '../../domain';

/** Jalali month names, index 0 = Farvardin, in the folded spelling `normalizePersian` yields. */
const MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'ابان',
  'اذر',
  'دی',
  'بهمن',
  'اسفند',
].map((m) => normalizePersian(m));

/** Spellings seen in the sheets that are not the month's name. */
const ALIASES: Readonly<Record<string, string>> = {
  [normalizePersian('فرودین')]: MONTHS[0],
};

/**
 * The follow-up the note names, as months after the surgery — the first
 * occurrence of that month after the surgery's own; the same month a year
 * on. `null` when the note names no month at all.
 */
export function legacyFollowUpMonths(
  note: string,
  surgeryDate: Date,
): number | null {
  const words = normalizePersian(note)
    .split(' ')
    .map((w) => ALIASES[w] ?? w);
  const month = MONTHS.findIndex((m) => words.includes(m));
  if (month === -1) return null;
  const diff = (month - getMonth(surgeryDate) + 12) % 12;
  return diff === 0 ? 12 : diff;
}

/** The structured follow-up a legacy note stands for; see {@link legacyFollowUp}. */
export interface LegacyFollowUp {
  followUpMonths: number;
  followUpDate: Date;
  followUpDoneAt: Date | null;
  followUpDoneInferred: boolean;
}

/**
 * The structured follow-up a legacy note implies for a surgery on
 * `surgeryDate` — what the backfill migration wrote, so an imported row
 * ends up exactly as an upgraded one. A follow-up already due before `now`
 * is closed on its due date, as the paper diary would have had it, but
 * flagged as assumed so staff confirm or reopen it. `null` when the note
 * names no month.
 */
export function legacyFollowUp(
  note: string,
  surgeryDate: Date,
  now: Date = new Date(),
): LegacyFollowUp | null {
  const months = legacyFollowUpMonths(note, surgeryDate);
  if (months === null) return null;
  const due = addMonths(surgeryDate, months);
  const past =
    JalaliDate.fromDate(due)!.toIsoDate() <
    JalaliDate.fromDate(now)!.toIsoDate();
  return {
    followUpMonths: months,
    followUpDate: due,
    followUpDoneAt: past ? due : null,
    followUpDoneInferred: past,
  };
}
