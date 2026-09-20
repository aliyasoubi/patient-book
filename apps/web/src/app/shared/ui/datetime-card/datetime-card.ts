import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';
import { format, getDate, getDay, getMonth, getYear } from 'date-fns-jalali';

import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../../core/jalali/jalali-date-adapter';
import { formatPersianNumber } from '../../pipes/persian-number.pipe';

/**
 * A live Shamsi date and clock for the dashboard. Ticks every second off a
 * single `now` signal so the displayed weekday, date, and time always agree
 * with each other and with the wall clock.
 */
@Component({
  selector: 'pb-datetime-card',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="pb-datetime" role="group" [attr.aria-label]="ariaLabel()">
      <div class="pb-datetime__date">
        <mat-icon class="pb-datetime__icon" aria-hidden="true">calendar_month</mat-icon>
        <span>{{ weekday() }}، {{ dayMonth() }} {{ year() }}</span>
      </div>
      <div class="pb-datetime__time">
        <mat-icon class="pb-datetime__icon" aria-hidden="true">schedule</mat-icon>
        <span class="pb-datetime__clock">{{ time() }}</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    /* Supporting content for a page header, not a card: date and clock in one
       quiet row so the first real number sits right under the title. The
       clock is the widest thing here, so it gets the medium weight. */
    .pb-datetime {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--pb-space-2) var(--pb-space-4);
      min-height: var(--pb-control-height);
      color: var(--mat-sys-on-surface-variant);

      &__date,
      &__time {
        display: flex;
        align-items: center;
        gap: var(--pb-space-2);
        white-space: nowrap;
      }

      &__date {
        font: var(--mat-sys-body-medium);
      }

      &__icon {
        font-size: var(--pb-icon-sm);
        color: var(--mat-sys-primary);
      }

      &__clock {
        font: var(--mat-sys-title-medium);
        font-variant-numeric: tabular-nums;
        // Tabular Persian digits for ASCII text — 'ss01' then 'tnum'; never
        // 'onum', which is Latin in this font. See .ltr-nums in styles.scss.
        font-feature-settings: 'ss01', 'tnum';
        color: var(--mat-sys-on-surface);
      }
    }
  `,
})
export class PbDatetimeCard {
  private readonly i18n = inject(TranslateService);
  private readonly now = signal(new Date());

  constructor() {
    const id = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected readonly weekday = computed(() => {
    this.i18n.currentLang();
    const key = JALALI_WEEKDAY_KEYS[getDay(this.now())];
    return this.i18n.instant(`day.${key}`);
  });

  protected readonly dayMonth = computed(() => {
    this.i18n.currentLang();
    const date = this.now();
    const day = formatPersianNumber(getDate(date));
    const month = this.i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]);
    return `${day} ${month}`;
  });

  protected readonly year = computed(() => formatPersianNumber(getYear(this.now())));

  protected readonly time = computed(() => formatPersianNumber(format(this.now(), 'HH:mm:ss')));

  protected readonly ariaLabel = computed(() => this.i18n.instant('dashboard.dateTimeAria'));
}
