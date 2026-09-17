import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

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
import { PbButton, PbDatetimeCard, PbPageHeader, PbSurface } from '../../shared/ui';
import type { DashboardStats, UpcomingSurgery } from '../../core/models/common.model';

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
  protected readonly upcomingSurgeries = signal<UpcomingSurgery[]>([]);
  /**
   * Its own flag, not `failed`: the two requests are independent, and "no
   * upcoming surgeries" must never be what a failed request looks like.
   */
  protected readonly upcomingFailed = signal(false);

  protected readonly greeting = computed(() => {
    this.i18n.currentLang();
    const hour = new Date().getHours();
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
    // A permanently-zero warning tile trains people to ignore warnings, so this
    // one appears only when there is actually something overdue.
    if (s.totals.overdueSurgeries > 0) {
      tiles.push({
        label: 'tile.overdueSurgeries',
        value: s.totals.overdueSurgeries,
        icon: 'event_busy',
        link: '/surgery',
        queryParams: { status: 'scheduled' },
        tone: 'warn',
      });
    }
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

  /** Last twelve months of new patients, as a sparkline path. */
  protected readonly trend = computed(() => {
    const months = (this.stats()?.newPatientsByMonth ?? []).slice(-12);
    if (months.length < 2) return null;
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

  /** Brand and tooth position, whichever of the two is actually recorded. */
  protected upcomingMeta(item: UpcomingSurgery): string {
    return [item.implantBrand, item.toothPosition].filter(Boolean).join(' · ');
  }

  constructor() {
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
    this.loadUpcoming();
  }

  /** Also the panel's own retry, so a failed list can be re-fetched by itself. */
  protected loadUpcoming(): void {
    this.upcomingFailed.set(false);
    this.registry.upcomingSurgeries().subscribe({
      next: (rows) => this.upcomingSurgeries.set(rows),
      error: () => this.upcomingFailed.set(true),
    });
  }
}
