/**
 * LEGACY — the imported sheets recorded a prosthesis follow-up as a bare
 * Jalali month name ("آذر ماه", "اواخر مهر"). Migration
 * `BackfillSurgeryFollowUps` turns those into the structured follow-up via
 * {@link legacyFollowUpMonths}; once it has run everywhere, this whole
 * wrapper can go. Delete, together:
 *
 *   - this file and its spec
 *   - `SurgeryQueueItem.prosthesisDue` (add a migration dropping the column)
 *   - `prosthesisDue` in the surgery response and in the web `SurgeryQueueItem`
 *   - the `LEGACY` branch in `surgery-list.html` and the `surgery.prosthesis` key
 *   - the `LEGACY` hint in `surgery-form.ts` and the `surgeryForm.followUpLegacy` key
 *
 * The migration itself stays: history has to replay.
 */
import { getMonth } from 'date-fns-jalali';

import { normalizePersian } from '../../domain';

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
