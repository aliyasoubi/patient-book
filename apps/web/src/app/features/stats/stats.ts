import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addMonths, format, startOfMonth } from 'date-fns-jalali';

import { RegistryService } from '../../core/services/registry.service';
import { PatientsService } from '../patients/data/patients.service';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  ageBandLabel,
  genderIcon,
  genderLabel,
  referralKindIcon,
  treatmentColor,
} from '../../shared/labels';
import { LoadError } from '../../shared/components/load-error';
import { PbPage, PbPageHeader, PbStatTile, PbSurface } from '../../shared/ui';
import type { PracticeStats } from '../../core/models/common.model';
import type { TreatmentType } from '../patients/data/patient.model';

interface TotalTile {
  label: string;
  value: number;
  icon: string;
  link: string | null;
}

/**
 * How the practice looks — totals, growth and who the patients are. The one
 * page for statistics: the dashboard keeps only the front desk's work, and
 * no other page shows counts or charts.
 */
@Component({
  selector: 'pb-stats',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressBarModule,
    PersianCountPipe,
    PersianNumberPipe,
    PbPage,
    PbPageHeader,
    PbStatTile,
    PbSurface,
    LoadError,
    TranslatePipe,
  ],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class Stats {
  private readonly registry = inject(RegistryService);
  private readonly patients = inject(PatientsService);
  private readonly i18n = inject(TranslateService);

  protected readonly genderLabel = genderLabel;
  protected readonly genderIcon = genderIcon;
  protected readonly ageBandLabel = ageBandLabel;
  protected readonly referralKindIcon = referralKindIcon;

  protected readonly color = treatmentColor;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly stats = signal<PracticeStats | null>(null);
  /** The treatment catalogue, shown whole beneath the figures. */
  protected readonly catalogue = signal<TreatmentType[]>([]);

  /** Each total opens its register; "seen lately" has no list of its own. */
  protected readonly tiles = computed<TotalTile[]>(() => {
    const t = this.stats()?.totals;
    if (!t) return [];
    return [
      { label: 'tile.patients', value: t.patients, icon: 'groups', link: '/patients' },
      { label: 'tile.recentlyActive', value: t.recentlyActive, icon: 'how_to_reg', link: null },
      { label: 'tile.implants', value: t.implantCases, icon: 'deployed_code', link: '/implants' },
      { label: 'tile.ortho', value: t.orthoCases, icon: 'straighten', link: '/ortho' },
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
    return this.i18n.instant('stats.trendAria', { max });
  }

  constructor() {
    this.load();
    this.patients.treatmentTypes().subscribe({
      next: (t) => this.catalogue.set(t),
      error: () => undefined,
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
