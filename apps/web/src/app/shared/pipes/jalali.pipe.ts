import { inject, Pipe, PipeTransform } from '@angular/core';
import type { JalaliValue } from '../../core/models/common.model';
import { JALALI_MONTH_KEYS } from '../../core/jalali/jalali-date-adapter';
import { TranslateService } from '@ngx-translate/core';
import { format, isValid } from 'date-fns-jalali';

const toPersian = (s: string): string =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

/**
 * When something happened, as the practice reads it: the Jalali day and the
 * time on this computer's clock, in Persian digits — `۱۴۰۵/۰۷/۲۷ ۱۴:۳۲`.
 */
export function jalaliStamp(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  return date && isValid(date) ? toPersian(format(date, 'yyyy/MM/dd HH:mm')) : '—';
}

export function formatJalaliLong(
  jalali: string,
  i18n: TranslateService,
  precision: JalaliValue['precision'] = 'day',
): string {
  const [y, m, d] = jalali.split('/');
  if (precision === 'year' || !m) return toPersian(y);
  const monthKey = JALALI_MONTH_KEYS[Number(m) - 1];
  const name = monthKey ? i18n.instant(monthKey) : String(Number(m));
  if (precision === 'month' || !d) return `${name} ${toPersian(y)}`;
  return `${toPersian(String(Number(d)))} ${name} ${toPersian(y)}`;
}

/**
 * Display a date at the precision the record actually holds.
 *
 * Handwritten birth dates are commonly a bare year. Padding those to
 * `۱۳۶۸/۰۱/۰۱` would assert a birthday nobody recorded, so a year-precision
 * value renders as just the year.
 */
@Pipe({ name: 'jalali', standalone: true, pure: false })
export class JalaliPipe implements PipeTransform {
  private readonly i18n = inject(TranslateService);

  transform(
    value: Pick<JalaliValue, 'jalali' | 'precision'> | null | undefined,
    style: 'numeric' | 'long' = 'numeric',
  ): string {
    if (!value?.jalali) return '—';
    if (style === 'numeric') return toPersian(value.jalali);

    return formatJalaliLong(value.jalali, this.i18n, value.precision);
  }
}

/**
 * A Jalali date the API sends as text — `1405/08/21`, or with a time,
 * `1405/08/21 14:32` — as people read it: «۲۱ آبان ۱۴۰۵», «۲۱ آبان ۱۴۰۵، ۱۴:۳۲».
 * Anything that is not such a date passes through in Persian digits.
 */
@Pipe({ name: 'faDate', standalone: true, pure: false })
export class FaDatePipe implements PipeTransform {
  private readonly i18n = inject(TranslateService);

  transform(value: string | null | undefined): string {
    if (!value) return '—';
    const [day, time] = value.trim().split(/\s+/);
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(day)) return toPersian(value);
    const words = formatJalaliLong(day, this.i18n, 'day');
    return time ? `${words}، ${toPersian(time)}` : words;
  }
}
