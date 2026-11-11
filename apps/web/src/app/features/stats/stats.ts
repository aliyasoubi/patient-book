import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addMonths, format, startOfMonth } from 'date-fns-jalali';

import { RegistryService } from '../../core/services/registry.service';
import { PatientsService } from '../patients/data/patients.service';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { ageBandLabel, genderLabel } from '../../shared/labels';
import { LoadError } from '../../shared/components/load-error';
import { PbCountUp, PbIcon, PbPage, PbPageHeader, PbSwitcher } from '../../shared/ui';
import type { SwitcherOption } from '../../shared/ui';
import type { LineIconName } from '../../shared/ui/icon/line-icons';
import type { PracticeStats } from '../../core/models/common.model';
import type { TreatmentType } from '../patients/data/patient.model';
import { MaterialConsumptionReport } from './material-consumption';
import { StatsCatalogue } from './stats-catalogue';
import { StatsColumns } from './stats-columns';
import { StatsDonut, type DonutPart } from './stats-donut';
import { StatsTrend } from './stats-trend';

/** The page's tabs, as the `tab` query parameter names them; the first has none. */
const TABS = ['practice', 'consumption'] as const;

interface TotalTile {
  label: string;
  value: number;
  icon: LineIconName;
  link: string | null;
}

/**
 * How the practice looks — totals, growth and who the patients are — and how
 * much material it uses a month. The one page for statistics: the dashboard
 * keeps only the front desk's work, and no other page shows counts or charts.
 */
@Component({
  selector: 'pb-stats',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MatIconModule,
    MaterialConsumptionReport,
    PersianCountPipe,
    PersianNumberPipe,
    PbCountUp,
    PbIcon,
    PbPage,
    PbPageHeader,
    PbSwitcher,
    StatsCatalogue,
    StatsTrend,
    StatsDonut,
    StatsColumns,
    LoadError,
    TranslatePipe,
  ],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class Stats {
  private readonly registry = inject(RegistryService);
  private readonly patients = inject(PatientsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly tabIndex = computed(() =>
    Math.max(0, TABS.indexOf(this.query().get('tab') as (typeof TABS)[number])),
  );

  protected readonly tabNames = TABS;
  protected readonly tabs: readonly SwitcherOption[] = [
    { value: 'practice', label: 'stats.practiceTab', icon: 'chart-bar' },
    { value: 'consumption', label: 'stats.consumptionTab', icon: 'packages' },
  ];

  protected readonly genderLabel = genderLabel;
  protected readonly ageBandLabel = ageBandLabel;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly stats = signal<PracticeStats | null>(null);
  /** The treatment catalogue, folded beneath the figures. */
  protected readonly catalogue = signal<TreatmentType[]>([]);
  /** The treatment list shows its six most common until asked for the rest. */
  protected readonly allTreatments = signal(false);

  /** Each total opens its register; "seen lately" has no list of its own. */
  protected readonly tiles = computed<TotalTile[]>(() => {
    const t = this.stats()?.totals;
    if (!t) return [];
    return [
      { label: 'tile.patients', value: t.patients, icon: 'users', link: '/patients' },
      { label: 'tile.recentlyActive', value: t.recentlyActive, icon: 'user-check', link: null },
      { label: 'tile.implants', value: t.implantCases, icon: 'dental', link: '/implants' },
      { label: 'tile.ortho', value: t.orthoCases, icon: 'ruler-2', link: '/ortho' },
    ];
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

  /** Women, men and (when there are any) records with no gender, as a ring. */
  protected readonly genderParts = computed<DonutPart[]>(() => {
    const parts: DonutPart[] = this.genderColumns().map((g) => ({
      key: g.key,
      label: genderLabel(g.key),
      count: g.count,
    }));
    const unknown = this.genderUnknown();
    if (unknown) parts.push({ key: 'unknown', label: 'gender.unknown', count: unknown });
    return parts;
  });

  /** The age bands as columns, youngest first. */
  protected readonly ageColumns = computed(() =>
    this.ageBars().map((b) => ({
      key: b.band,
      label: this.i18n.instant(ageBandLabel(b.band)),
      count: b.count,
    })),
  );

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
    // Each month at the middle of its twelfth, over its label below.
    const step = w / months.length;
    const points = months.map((m, i) => ({
      x: (i + 0.5) * step,
      y: h - (m.count / max) * h,
    }));
    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const first = points[0].x.toFixed(1);
    const last = points[points.length - 1].x.toFixed(1);
    const area = `${line} L${last},${h} L${first},${h} Z`;
    return { line, area, months, max, last: months[months.length - 1] };
  });

  constructor() {
    this.load();
    this.patients.treatmentTypes().subscribe({
      next: (t) => this.catalogue.set(t),
      error: () => undefined,
    });
  }

  protected selectTab(index: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index > 0 ? TABS[index] : null },
      replaceUrl: true,
    });
  }

  /** Also the retry handler — a failed load must be recoverable without a reload. */
  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.registry.practiceStats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
