import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addMonths, format, startOfMonth } from 'date-fns-jalali';

import { RegistryService } from '../../core/services/registry.service';
import { AuthService } from '../../core/services/auth.service';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  ageBandLabel,
  genderIcon,
  genderLabel,
  referralKindIcon,
  referralKindLabel,
  treatmentColor,
} from '../../shared/labels';
import { LoadError } from '../../shared/components/load-error';
import { PbButton, PbDatetimeCard, PbPage, PbPageHeader, PbSurface } from '../../shared/ui';
import type { DashboardStats, FollowUpDue } from '../../core/models/common.model';

interface StatTile {
  label: string;
  value: number;
  icon: string;
  link: string;
  queryParams?: Record<string, string>;
  tone: 'neutral' | 'warn';
}

@Component({
  selector: 'pb-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressBarModule,
    PersianCountPipe,
    PersianNumberPipe,
    PbButton,
    PbSurface,
    PbPageHeader,
    PbPage,
    LoadError,
    PbDatetimeCard,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly registry = inject(RegistryService);
  private readonly i18n = inject(TranslateService);
  protected readonly auth = inject(AuthService);

  protected readonly genderLabel = genderLabel;
  protected readonly genderIcon = genderIcon;
  protected readonly ageBandLabel = ageBandLabel;
  protected readonly referralKindLabel = referralKindLabel;
  protected readonly referralKindIcon = referralKindIcon;

  protected readonly color = treatmentColor;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly followUps = signal<FollowUpDue[]>([]);
  /**
   * Its own flag, not `failed`: the two requests are independent, and "no
   * follow-ups this week" must never be what a failed request looks like.
   */
  protected readonly followUpsFailed = signal(false);
  /** In flight, so the panel never shows "nobody to call" before it knows. */
  protected readonly followUpsLoading = signal(true);

  /**
   * The current hour, re-read every minute so the greeting turns from morning
   * to afternoon on a dashboard left open all day. Equal values do not
   * propagate, so this only recomputes the greeting when the hour changes.
   */
  private readonly hour = signal(new Date().getHours());

  protected readonly greeting = computed(() => {
    this.i18n.currentLang();
    const hour = this.hour();
    const name = this.auth.user()?.fullName ?? '';
    const part =
      hour < 12
        ? this.i18n.instant('greeting.morning')
        : hour < 17
          ? this.i18n.instant('greeting.afternoon')
          : this.i18n.instant('greeting.evening');
    return name ? this.i18n.instant('greeting.withName', { part, name }) : part;
  });

  /**
   * Ordered work-first: what needs attention, then what is happening next, then
   * the plain counts. Someone opening this at 9 AM should meet the backlog
   * before the totals, not after three charts.
   */
  protected readonly tiles = computed<StatTile[]>(() => {
    const s = this.stats();
    if (!s) return [];
    const tiles: StatTile[] = [
      {
        label: 'tile.needsReview',
        value: s.totals.needsReview,
        icon: 'error',
        link: '/patients',
        queryParams: { hasIssues: 'true' },
        tone: 'warn',
      },
    ];
    // A permanently-zero warning tile trains people to ignore warnings, so
    // these appear only when there is actually something overdue.
    if (s.totals.followUpsOverdue > 0) {
      tiles.push({
        label: 'tile.followUpsOverdue',
        value: s.totals.followUpsOverdue,
        icon: 'event_busy',
        link: '/surgery',
        // Exactly the rows the tile counts.
        queryParams: { followUp: 'overdue' },
        tone: 'warn',
      });
    }
    if (s.totals.labsOverdue > 0) {
      tiles.push({
        label: 'tile.labsOverdue',
        value: s.totals.labsOverdue,
        icon: 'schedule',
        link: '/labs',
        // The board, narrowed to exactly the cases the tile counts.
        queryParams: { overdue: 'true' },
        tone: 'warn',
      });
    }
    // The stock's two questions, counted exactly as the inventory list's
    // own filters answer them.
    if (s.totals.inventoryReorder > 0) {
      tiles.push({
        label: 'tile.inventoryReorder',
        value: s.totals.inventoryReorder,
        icon: 'shopping_cart',
        link: '/inventory',
        queryParams: { filter: 'reorder' },
        tone: 'warn',
      });
    }
    if (s.totals.inventoryExpiring > 0) {
      tiles.push({
        label: 'tile.inventoryExpiring',
        value: s.totals.inventoryExpiring,
        icon: 'hourglass_bottom',
        link: '/inventory',
        queryParams: { filter: 'expiry' },
        tone: 'warn',
      });
    }
    // Who to call this week: the operational number a receptionist opens
    // the dashboard for.
    tiles.push({
      label: 'tile.followUpsThisWeek',
      value: s.totals.followUpsThisWeek,
      icon: 'event_repeat',
      link: '/surgery',
      queryParams: { followUp: 'week' },
      tone: 'neutral',
    });
    tiles.push(
      {
        label: 'tile.patients',
        value: s.totals.patients,
        icon: 'groups',
        link: '/patients',
        tone: 'neutral',
      },
      {
        label: 'tile.implants',
        value: s.totals.implantCases,
        icon: 'deployed_code',
        link: '/implants',
        tone: 'neutral',
      },
      {
        label: 'tile.ortho',
        value: s.totals.orthoCases,
        icon: 'straighten',
        link: '/ortho',
        tone: 'neutral',
      },
    );
    return tiles;
  });

  /** Bar heights for the treatment chart, scaled to the largest value. */
  protected readonly treatmentBars = computed(() => {
    const list = this.stats()?.topTreatments ?? [];
    const max = Math.max(1, ...list.map((t) => t.count));
    return list.map((t) => ({ ...t, percent: Math.round((t.count / max) * 100) }));
  });

  protected readonly ageBars = computed(() => {
    const list = this.stats()?.ageBands ?? [];
    const max = Math.max(1, ...list.map((b) => b.count));
    return list.map((b) => ({ ...b, percent: Math.round((b.count / max) * 100) }));
  });

  /**
   * Women and men as two fixed columns — always both, in this order, even
   * when one count is zero, so the panel keeps its shape as the register
   * fills. Shares are of every patient, including those with no gender
   * recorded, so the two columns need not sum to 100%.
   */
  protected readonly genderColumns = computed(() => {
    const list = this.stats()?.gender ?? [];
    const total = list.reduce((sum, g) => sum + g.count, 0) || 1;
    return (['female', 'male'] as const).map((key) => {
      const count = list.find((g) => g.key === key)?.count ?? 0;
      return { key, count, percent: Math.round((count / total) * 100) };
    });
  });

  /** Records with no gender on file; shown only when there are any. */
  protected readonly genderUnknown = computed(
    () => this.stats()?.gender.find((g) => g.key === 'unknown')?.count ?? 0,
  );

  /**
   * The last twelve Jalali months up to this one, as a sparkline path. The API
   * lists only months that had a new patient, so the window is laid out here
   * and a month with none is a real zero rather than a skipped point.
   */
  protected readonly trend = computed(() => {
    const counts = new Map((this.stats()?.newPatientsByMonth ?? []).map((m) => [m.month, m.count]));
    const thisMonth = startOfMonth(new Date());
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = format(addMonths(thisMonth, i - 11), 'yyyy/MM');
      return { month, count: counts.get(month) ?? 0 };
    });
    if (months.every((m) => m.count === 0)) return null;
    const max = Math.max(1, ...months.map((m) => m.count));
    const w = 100;
    const h = 32;
    const step = w / (months.length - 1);
    const points = months.map((m, i) => ({
      x: i * step,
      y: h - (m.count / max) * h,
    }));
    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, months, max, last: months[months.length - 1] };
  });

  /** Screen-reader description of the sparkline. */
  protected trendLabel(max: number): string {
    return this.i18n.instant('dashboard.trendAria', { max });
  }

  constructor() {
    const id = setInterval(() => this.hour.set(new Date().getHours()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
    this.load();
  }

  /** Also the retry handler — a failed load must be recoverable without a reload. */
  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.registry.dashboard().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
    // Independent of the totals above: one failing must not block the other.
    this.loadFollowUps();
  }

  /** Also the panel's own retry, so a failed list can be re-fetched by itself. */
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
}
