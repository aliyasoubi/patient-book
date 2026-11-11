import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { getDate, getDay, getMonth, getYear } from 'date-fns-jalali';

import { RegistryService } from '../../core/services/registry.service';
import { AuthService } from '../../core/services/auth.service';
import { JALALI_MONTH_KEYS, JALALI_WEEKDAY_KEYS } from '../../core/jalali/jalali-date-adapter';
import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { LoadError } from '../../shared/components/load-error';
import {
  PbButton,
  PbCountUp,
  PbIcon,
  PbShamsiCalendar,
  type CalendarMarkTone,
  type LineIconName,
} from '../../shared/ui';
import type { DashboardSummary, FollowUpDue } from '../../core/models/common.model';
import { DashboardAgenda } from './dashboard-agenda';

/** How a count reads: `warn` is slipping, `caution` is routine work that is due. */
export type WorkTone = 'brand' | 'warn' | 'caution' | 'neutral';

/** One count of the front desk's work — always a list, and always opening exactly that list. */
export interface WorkItem {
  key: string;
  label: string;
  value: number;
  icon: LineIconName;
  link: string;
  queryParams?: Record<string, string>;
  tone: WorkTone;
}

/**
 * The front desk's start page: what needs doing, in order of urgency. No
 * totals and no charts — those live on the statistics page — only work, and
 * every count opens exactly the list it counts.
 *
 * - The focus row: today's calls, overdue follow-ups and late lab work, the
 *   three things that cannot wait.
 * - This week: the follow-ups coming due, as an agenda by day.
 * - The queue: everything else that is routine but due, a row each; a queue
 *   at zero says it is clear rather than going quiet.
 *
 * Counts and follow-ups load independently, so one failing never blanks the
 * other — and "nobody to call" is only ever said once the list is in.
 */
@Component({
  selector: 'pb-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    LoadError,
    DashboardAgenda,
    PbButton,
    PbCountUp,
    PbIcon,
    PbShamsiCalendar,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly registry = inject(RegistryService);
  private readonly i18n = inject(TranslateService);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly followUps = signal<FollowUpDue[]>([]);
  /** Its own flag: "no follow-ups this week" must never be what a failed request looks like. */
  protected readonly followUpsFailed = signal(false);
  /** In flight, so the agenda never says "nobody to call" before it knows. */
  protected readonly followUpsLoading = signal(true);

  /** Re-read every minute, so the greeting turns over on a dashboard left open all day. */
  private readonly now = signal(new Date());

  protected readonly greeting = computed(() => {
    this.i18n.currentLang();
    const hour = this.now().getHours();
    const name = this.auth.user()?.fullName ?? '';
    const part =
      hour < 12
        ? this.i18n.instant('greeting.morning')
        : hour < 17
          ? this.i18n.instant('greeting.afternoon')
          : this.i18n.instant('greeting.evening');
    return name ? this.i18n.instant('greeting.withName', { part, name }) : part;
  });

  /** «چهارشنبه، ۲۰ آبان ۱۴۰۵» */
  protected readonly today = computed(() => {
    this.i18n.currentLang();
    return this.dayTitle(this.now());
  });

  /** The three things that cannot wait. */
  protected readonly focus = computed((): WorkItem[] => {
    const s = this.summary();
    if (!s) return [];
    return [
      {
        key: 'calls',
        label: 'tile.callsToday',
        value: s.callsToday,
        icon: 'phone',
        link: '/surgery',
        queryParams: { followUp: 'callsToday' },
        tone: 'brand',
      },
      {
        key: 'overdue',
        label: 'tile.followUpsOverdue',
        value: s.followUpsOverdue,
        icon: 'calendar-x',
        link: '/surgery',
        queryParams: { followUp: 'overdue' },
        tone: 'warn',
      },
      {
        key: 'labsOverdue',
        label: 'tile.labsOverdue',
        value: s.labsOverdue,
        icon: 'flask',
        link: '/labs',
        queryParams: { overdue: 'true' },
        tone: 'warn',
      },
    ];
  });

  /** Routine but due — each row a list to work through. */
  protected readonly queue = computed((): WorkItem[] => {
    const s = this.summary();
    if (!s) return [];
    return [
      {
        key: 'review',
        label: 'tile.needsReview',
        value: s.needsReview,
        icon: 'alert-circle',
        link: '/patients',
        queryParams: { hasIssues: 'true' },
        tone: 'warn',
      },
      {
        key: 'labsToBook',
        label: 'tile.labsToBook',
        value: s.labsToBook,
        icon: 'calendar-check',
        link: '/labs',
        queryParams: { toBook: 'true' },
        tone: 'caution',
      },
      {
        key: 'week',
        label: 'tile.followUpsThisWeek',
        value: s.followUpsThisWeek,
        icon: 'calendar',
        link: '/surgery',
        queryParams: { followUp: 'week' },
        tone: 'neutral',
      },
      {
        key: 'reorder',
        label: 'tile.inventoryReorder',
        value: s.inventoryReorder,
        icon: 'packages',
        link: '/inventory/order',
        tone: 'caution',
      },
      {
        key: 'expiring',
        label: 'tile.inventoryExpiring',
        value: s.inventoryExpiring,
        icon: 'clock',
        link: '/inventory',
        queryParams: { filter: 'expiry' },
        tone: 'caution',
      },
      {
        key: 'recall',
        label: 'tile.recall',
        value: s.inactiveOverYear,
        icon: 'history',
        link: '/patients',
        queryParams: { inactiveMonths: '12' },
        tone: 'neutral',
      },
    ];
  });

  /** The days of the coming week that have a follow-up, dotted on the calendar. */
  protected readonly followUpMarks = computed(() => {
    const marks = new Map<string, CalendarMarkTone>();
    for (const item of this.followUps()) {
      if (item.followUpDate) marks.set(item.followUpDate, 'brand');
    }
    return marks;
  });

  constructor() {
    const id = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
    this.load();
  }

  /** Also the retry handler — a failed load must be recoverable without a reload. */
  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.registry.dashboard().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
    // Independent of the counts above: one failing must not block the other.
    this.loadFollowUps();
  }

  /** Also the agenda's own retry, so a failed list can be re-fetched by itself. */
  protected loadFollowUps(): void {
    this.followUpsFailed.set(false);
    this.followUpsLoading.set(true);
    this.registry.followUpsThisWeek().subscribe({
      next: (rows) => {
        this.followUps.set(rows);
        this.followUpsLoading.set(false);
      },
      error: () => {
        this.followUpsFailed.set(true);
        this.followUpsLoading.set(false);
      },
    });
  }

  private dayTitle(date: Date): string {
    const weekday = this.i18n.instant(`day.${JALALI_WEEKDAY_KEYS[getDay(date)]}`);
    const month = this.i18n.instant(JALALI_MONTH_KEYS[getMonth(date)]);
    return `${weekday}، ${formatPersianNumber(getDate(date))} ${month} ${formatPersianNumber(getYear(date))}`;
  }
}
