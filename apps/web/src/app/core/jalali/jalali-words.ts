import type { TranslateService } from '@ngx-translate/core';
import { getDate, getDay, getMonth, getYear } from 'date-fns-jalali';

import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from './jalali-date-adapter';

/**
 * A Jalali date as people say it — «پنجشنبه ۲۸ آبان ۱۴۰۵» — rather than
 * ۱۴۰۵/۰۸/۲۸, which has to be worked out. The weekday comes first, because
 * that is what the front desk plans around; the year can be left off.
 * Digits are ASCII here and drawn Persian by the app's font.
 */
export function jalaliInWords(
  date: Date,
  i18n: TranslateService,
  { weekday = true, year = true }: { weekday?: boolean; year?: boolean } = {},
): string {
  const parts = [
    weekday ? i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(date)]}`) : null,
    String(getDate(date)),
    i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]),
    year ? String(getYear(date)) : null,
  ];
  return parts.filter((p) => p !== null).join(' ');
}
