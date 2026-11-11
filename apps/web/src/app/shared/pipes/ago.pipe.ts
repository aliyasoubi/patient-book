import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import type { JalaliValue } from '../../core/models/common.model';
import { formatPersianNumber } from './persian-number.pipe';

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long ago a date was, the way it is said: «امروز», «دیروز», «۵ روز
 * پیش», «۳ ماه پیش», «۲ سال پیش». For a glance down a list — the exact date
 * belongs beside it, smaller.
 */
export function timeAgo(
  value: JalaliValue | string | null | undefined,
  i18n: TranslateService,
  now = new Date(),
): string {
  const iso = typeof value === 'string' ? value : value?.iso;
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.floor((startOfToday - then.getTime()) / DAY) + 1;
  if (days <= 0) return i18n.instant('time.today');
  if (days === 1) return i18n.instant('time.yesterday');
  if (days < 31) return i18n.instant('time.daysAgo', { count: formatPersianNumber(days) });
  if (days < 365) {
    return i18n.instant('time.monthsAgo', { count: formatPersianNumber(Math.floor(days / 30)) });
  }
  return i18n.instant('time.yearsAgo', { count: formatPersianNumber(Math.floor(days / 365)) });
}

@Pipe({ name: 'ago', standalone: true })
export class AgoPipe implements PipeTransform {
  private readonly i18n = inject(TranslateService);

  transform(value: JalaliValue | string | null | undefined): string {
    return timeAgo(value, this.i18n);
  }
}
