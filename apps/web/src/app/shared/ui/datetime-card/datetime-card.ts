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

    .pb-datetime {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--pb-space-3);
      padding: 14px 18px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-large);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--mat-sys-primary) 10%, var(--mat-sys-surface)),
        var(--mat-sys-surface)
      );

      &__date,
      &__time {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      &__date {
        font: var(--mat-sys-title-medium);
        color: var(--mat-sys-on-surface);
      }

      &__icon {
        font-size: var(--pb-icon-sm);
        color: var(--mat-sys-primary);
      }

      &__clock {
        font-size: var(--mat-sys-headline-small-size);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.5px;
        color: var(--mat-sys-on-surface);
      }

      @media (max-width: 480px) {
        justify-content: center;
        text-align: center;
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
