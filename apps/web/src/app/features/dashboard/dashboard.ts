import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { RegistryService } from '../../core/services/registry.service';
import { AuthService } from '../../core/services/auth.service';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { LoadError } from '../../shared/components/load-error';
import {
  PbButton,
  PbDatetimeCard,
  PbPage,
  PbPageHeader,
  PbStatTile,
  PbSurface,
} from '../../shared/ui';
import type { StatTileTone } from '../../shared/ui';
import type { DashboardSummary, FollowUpDue } from '../../core/models/common.model';

interface WorkTile {
  label: string;
  value: number;
  icon: string;
  link: string;
  queryParams?: Record<string, string>;
  tone: StatTileTone;
}

/**
 * The front desk's page: what needs doing today, each count a link to the
 * list it counts. How the practice looks — totals, growth, demographics,
 * referrals — is on the statistics page, not here.
 */
@Component({
  selector: 'pb-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressBarModule,
    PersianNumberPipe,
    PbButton,
    PbStatTile,
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

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly summary = signal<DashboardSummary | null>(null);
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
   * Ordered by urgency: what is late, then what is due this week, then the
   * standing recall list. Every tile is a list to work through; the
   * practice's totals live on the statistics page.
   */
  protected readonly tiles = computed<WorkTile[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const tiles: WorkTile[] = [
      {
        label: 'tile.needsReview',
        value: s.needsReview,
        icon: 'error',
        link: '/patients',
        queryParams: { hasIssues: 'true' },
        tone: 'warn',
      },
    ];
    // A permanently-zero warning tile trains people to ignore warnings, so
    // these appear only when there is actually something overdue.
    if (s.followUpsOverdue > 0) {
      tiles.push({
        label: 'tile.followUpsOverdue',
        value: s.followUpsOverdue,
        icon: 'event_busy',
        link: '/surgery',
        // Exactly the rows the tile counts.
        queryParams: { followUp: 'overdue' },
        tone: 'warn',
      });
    }
    // The front desk's lab list: work that is back and has no booking yet.
    if (s.labsToBook > 0) {
      tiles.push({
        label: 'tile.labsToBook',
        value: s.labsToBook,
        icon: 'event_busy',
        link: '/labs',
        // The board, narrowed to exactly the cases the tile counts.
        queryParams: { toBook: 'true' },
        tone: 'warn',
      });
    }
    if (s.labsOverdue > 0) {
      tiles.push({
        label: 'tile.labsOverdue',
        value: s.labsOverdue,
        icon: 'schedule',
        link: '/labs',
        // The board, narrowed to exactly the cases the tile counts.
        queryParams: { overdue: 'true' },
        tone: 'warn',
      });
    }
    // The stock's two questions, counted exactly as the inventory list's
    // own filters answer them. What to order opens the order list — the
    // same items, with the quantity to ask the supplier for.
    if (s.inventoryReorder > 0) {
      tiles.push({
        label: 'tile.inventoryReorder',
        value: s.inventoryReorder,
        icon: 'shopping_cart',
        link: '/inventory/order',
        tone: 'warn',
      });
    }
    if (s.inventoryExpiring > 0) {
      tiles.push({
        label: 'tile.inventoryExpiring',
        value: s.inventoryExpiring,
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
      value: s.followUpsThisWeek,
      icon: 'event_repeat',
      link: '/surgery',
      queryParams: { followUp: 'week' },
      tone: 'neutral',
    });
    // The recall list: patients with no visit on file in over a year. A
    // standing list rather than an alarm, so it never turns red.
    tiles.push({
      label: 'tile.recall',
      value: s.inactiveOverYear,
      icon: 'history',
      link: '/patients',
      queryParams: { inactiveMonths: '12' },
      tone: 'neutral',
    });
    return tiles;
  });

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
