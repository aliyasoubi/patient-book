import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  addDays,
  format as formatJalali,
  getDate,
  getDay,
  getMonth,
  getYear,
  isValid,
  parse as parseJalali,
} from 'date-fns-jalali';

import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../core/jalali/jalali-date-adapter';
import type { FollowUpDue } from '../../core/models/common.model';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { PbIcon } from '../../shared/ui';
import { PhonePipe } from '../../shared/pipes/phone.pipe';

/** A day of the coming week, with the follow-ups due on it. */
interface AgendaDay {
  date: string;
  title: string;
  relative: 'today' | 'tomorrow' | null;
  items: FollowUpDue[];
}

/**
 * The dashboard's "this week": the follow-ups coming due, as an agenda — a
 * heading per day, «امروز» and «فردا» called by name, the people to call
 * under each. While the list is in flight it shows its shape, never "nobody
 * to call": that is only said once the answer is in.
 */
@Component({
  selector: 'pb-dashboard-agenda',
  standalone: true,
  imports: [PhonePipe, RouterLink, TranslatePipe, EmptyState, LoadError, PbIcon],
  templateUrl: './dashboard-agenda.html',
  styleUrl: './dashboard-agenda.scss',
})
export class DashboardAgenda {
  private readonly i18n = inject(TranslateService);

  readonly items = input<FollowUpDue[]>([]);
  readonly loading = input(false);
  readonly failed = input(false);
  readonly retry = output<void>();

  /** Re-read every minute, so «امروز» moves on at midnight on a page left open. */
  private readonly now = signal(new Date());

  protected readonly agenda = computed<AgendaDay[]>(() => {
    this.i18n.currentLang();
    const now = this.now();
    const todayKey = formatJalali(now, 'yyyy/MM/dd');
    const tomorrowKey = formatJalali(addDays(now, 1), 'yyyy/MM/dd');
    const days = new Map<string, FollowUpDue[]>();
    for (const item of this.items()) {
      const key = item.followUpDate ?? '';
      days.set(key, [...(days.get(key) ?? []), item]);
    }
    return [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => {
        const parsed = parseJalali(date, 'yyyy/MM/dd', now);
        return {
          date,
          title: isValid(parsed) ? this.dayTitle(parsed) : formatPersianNumber(date),
          relative: date === todayKey ? 'today' : date === tomorrowKey ? 'tomorrow' : null,
          items,
        };
      });
  });

  constructor() {
    const id = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  private dayTitle(date: Date): string {
    const weekday = this.i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(date)]}`);
    const month = this.i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]);
    return `${weekday}، ${formatPersianNumber(getDate(date))} ${month} ${formatPersianNumber(getYear(date))}`;
  }
}
