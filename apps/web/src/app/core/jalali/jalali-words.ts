import type { TranslateService } from '@ngx-translate/core';
import { getDate, getDay, getMonth, getYear } from 'date-fns-jalali';

import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from './jalali-date-adapter';

/**
 * A Jalali date as people say it — «پنجشنبه ۲۸ آبان ۱۴۰۵» — rather than
 * ۱۴۰۵/۰۸/۲۸, which has to be worked out. The weekday comes first, because
 * that is what the front desk plans around; the year can be left off.
 * Digits are Persian in the text itself, not just in how a font draws
 * them, so every place shows them the same and a screen reader reads them.
 */
export function jalaliInWords(
  date: Date,
  i18n: TranslateService,
  { weekday = true, year = true }: { weekday?: boolean; year?: boolean } = {},
): string {
  const parts = [
    weekday ? i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(date)]}`) : null,
    formatPersianNumber(getDate(date)),
    i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]),
    year ? formatPersianNumber(getYear(date)) : null,
  ];
  return parts.filter((p) => p !== null).join(' ');
}
