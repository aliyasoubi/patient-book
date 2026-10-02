import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  addDays,
  addMonths,
  format,
  getDate,
  getDay,
  getDaysInMonth,
  getMonth,
  getYear,
  isSameDay,
  startOfMonth,
} from 'date-fns-jalali';

import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../../core/jalali/jalali-date-adapter';
import { formatPersianNumber } from '../../pipes/persian-number.pipe';
import { PbIconButton } from '../icon-button/icon-button';

/** Saturday-first column for a JavaScript weekday (Sunday = 0). */
const column = (weekday: number): number => (weekday + 1) % 7;

/**
 * Today on the dashboard: the time and the Shamsi date over a month
 * calendar that can be paged back and forward. Everything derives from one
 * `now` signal, so the clock, the date line and the highlighted day roll over
 * together at midnight.
 */
@Component({
  selector: 'pb-datetime-card',
  standalone: true,
  imports: [TranslatePipe, PbIconButton],
  template: `
    <section class="pb-today" [attr.aria-label]="'dashboard.dateTimeAria' | translate">
      <div class="pb-today__time">{{ time() }}</div>
      <div class="pb-today__date">{{ dateLine() }}</div>

      <div class="pb-today__bar">
        <h3 class="pb-today__month" aria-live="polite">{{ monthTitle() }}</h3>
        @if (offset() !== 0) {
          <button type="button" class="pb-today__back" (click)="offset.set(0)">
            {{ 'dashboard.today' | translate }}
          </button>
        }
        <pb-icon-button
          icon="chevron_right"
          size="compact"
          [ariaLabel]="'dashboard.previousMonth' | translate"
          [tooltip]="'dashboard.previousMonth' | translate"
          (click)="offset.set(offset() - 1)"
        />
        <pb-icon-button
          icon="chevron_left"
          size="compact"
          [ariaLabel]="'dashboard.nextMonth' | translate"
          [tooltip]="'dashboard.nextMonth' | translate"
          (click)="offset.set(offset() + 1)"
        />
      </div>

      <div class="pb-today__grid" aria-hidden="true">
        @for (name of weekdays(); track $index) {
          <span class="pb-today__weekday" [class.pb-today__holiday]="$last">{{ name }}</span>
        }
        @for (blank of leading(); track $index) {
          <span></span>
        }
        @for (day of days(); track day.label) {
          <span
            class="pb-today__day"
            [class.pb-today__holiday]="day.holiday"
            [class.pb-today__day--today]="day.today"
            >{{ day.label }}</span
          >
        }
      </div>
    </section>
  `,
  styles: `
    @use '../../../../styles/surface';

    /* The same outlined card as every other dashboard panel. */
    :host {
      @include surface.outlined;

      display: block;
      padding: var(--pb-space-4);
    }

    .pb-today {
      &__time {
        font: var(--mat-sys-headline-medium);
        font-feature-settings: var(--pb-font-numeric);
        color: var(--mat-sys-on-surface);
      }

      &__date {
        font: var(--mat-sys-body-medium);
        color: var(--mat-sys-on-surface-variant);
      }

      &__bar {
        display: flex;
        align-items: center;
        gap: var(--pb-space-1);
        margin-block: var(--pb-space-4) var(--pb-space-2);
        padding-block-start: var(--pb-space-3);
        border-block-start: 1px solid var(--mat-sys-outline-variant);
      }

      &__month {
        flex: 1;
        margin: 0;
        font: var(--mat-sys-title-small);
        color: var(--mat-sys-on-surface);
      }

      &__back {
        padding: 2px var(--pb-space-3);
        border: 1px solid var(--mat-sys-outline);
        border-radius: var(--mat-sys-corner-full);
        background: transparent;
        font: var(--mat-sys-label-medium);
        color: var(--mat-sys-primary);
        cursor: pointer;

        &:hover {
          background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
        }

        &:focus-visible {
          outline: 2px solid var(--mat-sys-primary);
          outline-offset: 2px;
        }
      }

      &__grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        row-gap: var(--pb-space-1);
        text-align: center;
      }

      &__weekday {
        padding-block: var(--pb-space-1);
        font: var(--mat-sys-label-medium);
        color: var(--mat-sys-on-surface-variant);
      }

      &__day {
        display: grid;
        place-items: center;
        justify-self: center;
        inline-size: 32px;
        block-size: 32px;
        border-radius: 50%;
        font: var(--mat-sys-body-medium);
        color: var(--mat-sys-on-surface);
        transition: background-color 120ms var(--pb-ease-standard);

        /* M3 date picker: today is the one filled circle. */
        &--today {
          background: var(--mat-sys-primary);
          color: var(--mat-sys-on-primary);
        }

        /* M3 state layer: an 8% wash of the content colour under the pointer.
           Pointer devices only, so a tap on a tablet does not leave it stuck. */
        @media (hover: hover) {
          &:hover {
            background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
          }

          &--today:hover {
            background: color-mix(in srgb, var(--mat-sys-on-primary) 8%, var(--mat-sys-primary));
          }
        }
      }

      /* Friday, the Iranian weekend. */
      &__holiday:not(.pb-today__day--today) {
        color: var(--mat-sys-error);
      }
    }
  `,
})
export class PbDatetimeCard {
  private readonly i18n = inject(TranslateService);
  private readonly now = signal(new Date());
  /** Months away from the current one; 0 is this month. */
  protected readonly offset = signal(0);

  constructor() {
    const id = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected readonly time = computed(() => formatPersianNumber(format(this.now(), 'HH:mm')));

  protected readonly dateLine = computed(() => {
    this.i18n.currentLang();
    const date = this.now();
    const weekday = this.i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(date)]}`);
    const month = this.i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]);
    return `${weekday}، ${formatPersianNumber(getDate(date))} ${month} ${formatPersianNumber(getYear(date))}`;
  });

  protected readonly viewMonth = computed(() => addMonths(startOfMonth(this.now()), this.offset()));

  protected readonly monthTitle = computed(() => {
    this.i18n.currentLang();
    const month = this.viewMonth();
    return `${this.i18n.instant(JALALI_MONTH_KEYS[getMonth(month)])} ${formatPersianNumber(getYear(month))}`;
  });

  /** Column headers, Saturday first. */
  protected readonly weekdays = computed(() => {
    this.i18n.currentLang();
    return [6, 0, 1, 2, 3, 4, 5].map((d) =>
      this.i18n.instant(`dayNarrow.${JALALI_WEEKDAY_KEYS[d]}`),
    );
  });

  /** Empty cells before the 1st, so it falls under its weekday. */
  protected readonly leading = computed(() =>
    Array.from({ length: column(getDay(this.viewMonth())) }),
  );

  protected readonly days = computed(() => {
    const start = this.viewMonth();
    const now = this.now();
    return Array.from({ length: getDaysInMonth(start) }, (_, i) => {
      const date = addDays(start, i);
      return {
        label: formatPersianNumber(i + 1),
        today: isSameDay(date, now),
        holiday: getDay(date) === 5,
      };
    });
  });
}
