import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { RegistryService } from '../../core/services/registry.service';
import { AuthService } from '../../core/services/auth.service';
import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  ageBandLabel,
  genderLabel,
  referralKindIcon,
  referralKindLabel,
  treatmentColor,
} from '../../shared/labels';
import { PbButton, PbPageHeader, PbSurface } from '../../shared/ui';
import type { DashboardStats } from '../../core/models/common.model';

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
    MatTooltipModule,
    PersianCountPipe,
    PersianNumberPipe,
    PbButton,
    PbSurface,
    PbPageHeader,
    MatIconModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly registry = inject(RegistryService);
  protected readonly auth = inject(AuthService);

  protected readonly genderLabel = genderLabel;
  protected readonly ageBandLabel = ageBandLabel;
  protected readonly referralKindLabel = referralKindLabel;
  protected readonly referralKindIcon = referralKindIcon;

  protected readonly color = treatmentColor;

  protected readonly loading = signal(true);
  protected readonly stats = signal<DashboardStats | null>(null);

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const name = this.auth.user()?.fullName ?? '';
    const part =
      hour < 12
        ? $localize`:@@greeting.morning:صبح بخیر`
        : hour < 17
          ? $localize`:@@greeting.afternoon:ظهر بخیر`
          : $localize`:@@greeting.evening:عصر بخیر`;
    return name ? $localize`:@@greeting.withName:${part}:part:، ${name}:name:` : part;
  });

  protected readonly tiles = computed<StatTile[]>(() => {
    const s = this.stats();
    if (!s) return [];
    const tiles: StatTile[] = [
      {
        label: $localize`:@@tile.patients:کل بیماران`,
        value: s.totals.patients,
        icon: 'groups',
        link: '/patients',
        tone: 'neutral',
      },
      {
        label: $localize`:@@tile.implants:پرونده‌های ایمپلنت`,
        value: s.totals.implantCases,
        icon: 'deployed_code',
        link: '/implants',
        tone: 'neutral',
      },
      {
        label: $localize`:@@tile.upcomingSurgeries:جراحی‌های پیش‌رو`,
        value: s.totals.upcomingSurgeries,
        icon: 'event_available',
        link: '/surgery',
        queryParams: { status: 'scheduled' },
        tone: 'neutral',
      },
      {
        label: $localize`:@@tile.needsReview:نیازمند بازبینی`,
        value: s.totals.needsReview,
        icon: 'error',
        link: '/patients',
        queryParams: { hasIssues: 'true' },
        tone: 'warn',
      },
    ];
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

  protected readonly genderSplit = computed(() => {
    const list = this.stats()?.gender ?? [];
    const total = list.reduce((sum, g) => sum + g.count, 0) || 1;
    return list.map((g) => ({ ...g, percent: Math.round((g.count / total) * 100) }));
  });

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
    return $localize`:@@dashboard.trendAria:روند بیماران جدید، بیشینه ${max}:max: نفر در ماه`;
  }

  constructor() {
    this.registry.dashboard().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
