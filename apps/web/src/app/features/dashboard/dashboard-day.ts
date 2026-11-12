import { MatTooltipModule } from '@angular/material/tooltip';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addDays, addMonths, format as formatJalali, isSameMonth } from 'date-fns-jalali';

import { jalaliInWords } from '../../core/jalali/jalali-words';
import type { FollowUpDue } from '../../core/models/common.model';
import { PhonePipe } from '../../shared/pipes/phone.pipe';
import { PbAutoHeight, PbIcon, PbShamsiCalendar, type CalendarMarkTone } from '../../shared/ui';

/**
 * The dashboard's month, to work from rather than only to look at: the days
 * with follow-ups are dotted, and a tap on a day lists who is due that day,
 * each with their number to call and the way into the list. The dashboard
 * knows the coming week; a day outside it offers the list for its month.
 */
@Component({
  selector: 'pb-dashboard-day',
  standalone: true,
  imports: [
    MatTooltipModule,
    PhonePipe,
    RouterLink,
    TranslatePipe,
    PbAutoHeight,
    PbIcon,
    PbShamsiCalendar,
  ],
  template: `
    <pb-shamsi-calendar
      [selected]="selected()"
      [marks]="marks()"
      [compact]="true"
      (dateChange)="selected.set($event)"
    />

    <div class="day">
      <pb-auto-height>
        <header class="day__head">
          <strong>{{ title() }}</strong>
        </header>

        @if (loading()) {
          <span class="day__skeleton" aria-hidden="true"></span>
        } @else if (dayItems().length) {
          <ul class="day__list">
            @for (item of dayItems(); track item.id) {
              <li class="person" animate.enter="person--in">
                <a
                  class="person__main"
                  routerLink="/surgery"
                  [queryParams]="{ q: item.recordedName }"
                >
                  <span class="person__avatar" aria-hidden="true">{{
                    item.recordedName.trim().charAt(0)
                  }}</span>
                  <span class="person__text">
                    <strong>{{ item.recordedName }}</strong>
                    @if (item.mobile) {
                      <small dir="ltr">{{ item.mobile | phone }}</small>
                    }
                  </span>
                </a>
                @if (item.mobile) {
                  <a
                    class="person__call"
                    [href]="'tel:' + item.mobile"
                    [attr.aria-label]="
                      'surgery.callPatient' | translate: { name: item.recordedName }
                    "
                    [matTooltip]="'surgery.callPatient' | translate: { name: item.recordedName }"
                  >
                    <pb-icon name="phone" [size]="16" />
                  </a>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="day__empty" animate.enter="person--in">
            {{ (inWeek() ? 'dashboard.dayFree' : 'dashboard.dayOutside') | translate }}
          </p>
        }

        @if (!inWeek()) {
          <a class="day__link" routerLink="/surgery" [queryParams]="listParams()">
            {{ 'dashboard.dayOpenList' | translate }}
            <pb-icon name="arrow-left" [size]="16" />
          </a>
        }
      </pb-auto-height>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-3);
    }

    .day pb-auto-height {
      --auto-gap: var(--pb-space-3);
    }

    .day {
      padding-block-start: var(--pb-space-3);
      border-block-start: 1px solid var(--pb-neutral-100);
    }

    .day__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pb-space-2);

      strong {
        color: var(--pb-graphite);
        font-size: 0.875rem;
        font-weight: 800;
      }
    }

    .day__list {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .person {
      display: flex;
      align-items: center;
      gap: var(--pb-space-2);
    }

    .person--in {
      animation: person-in 280ms var(--pb-ease-emphasized);
    }

    @keyframes person-in {
      from {
        opacity: 0;
        translate: 0 4px;
      }
    }

    .person__main {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: var(--pb-space-3);
      min-inline-size: 0;
      padding: var(--pb-space-2);
      border-radius: 12px;
      color: inherit;
      text-decoration: none;
      transition: background-color 160ms var(--pb-ease-standard);

      &:hover {
        background: var(--pb-neutral-50);
      }
    }

    .person__avatar {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 10px;
      background: var(--pb-neutral-100);
      color: var(--pb-neutral-600);
      font-weight: 800;
    }

    .person__text {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;

      strong {
        overflow: hidden;
        color: var(--pb-graphite);
        font-size: 0.8125rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        align-self: flex-end;
        color: var(--pb-neutral-500);
        font-size: 0.75rem;
      }
    }

    .person__call {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      inline-size: 34px;
      block-size: 34px;
      border: 1px solid var(--pb-neutral-200);
      border-radius: 10px;
      color: var(--pb-brand);
      transition:
        background-color 160ms var(--pb-ease-standard),
        scale 150ms var(--pb-ease-standard);

      &:hover {
        background: color-mix(in srgb, var(--pb-brand) 8%, var(--pb-surface));
      }

      &:active {
        scale: 0.92;
      }
    }

    .day__empty {
      margin: 0;
      color: var(--pb-neutral-500);
      font-size: 0.8125rem;
      line-height: 1.8;
    }

    .day__link {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: var(--pb-space-1);
      color: var(--pb-brand-strong);
      font-size: 0.8125rem;
      font-weight: 700;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .day__skeleton {
      display: block;
      block-size: 44px;
      border-radius: 12px;
      background: var(--pb-neutral-100);
    }
  `,
})
export class DashboardDay {
  private readonly i18n = inject(TranslateService);

  readonly items = input<FollowUpDue[]>([]);
  readonly loading = input(false);

  protected readonly selected = signal(new Date());
  private readonly key = computed(() => formatJalali(this.selected(), 'yyyy/MM/dd'));

  protected readonly title = computed(() => {
    this.i18n.currentLang();
    return jalaliInWords(this.selected(), this.i18n, { year: false });
  });

  protected readonly marks = computed(() => {
    const marks = new Map<string, CalendarMarkTone>();
    for (const item of this.items()) {
      if (item.followUpDate) marks.set(item.followUpDate, 'brand');
    }
    return marks;
  });

  protected readonly dayItems = computed(() =>
    this.items().filter((item) => item.followUpDate === this.key()),
  );

  /** Within the coming week, the days the dashboard has the follow-ups for. */
  protected readonly inWeek = computed(() => {
    const now = new Date();
    const key = this.key();
    return (
      key >= formatJalali(now, 'yyyy/MM/dd') && key <= formatJalali(addDays(now, 6), 'yyyy/MM/dd')
    );
  });

  /** The list that covers the day picked: its month, if this one or the next. */
  protected readonly listParams = computed(() => {
    const now = new Date();
    const day = this.selected();
    if (isSameMonth(day, now)) return { followUp: 'thisMonth' };
    if (isSameMonth(day, addMonths(now, 1))) return { followUp: 'nextMonth' };
    return {};
  });
}
