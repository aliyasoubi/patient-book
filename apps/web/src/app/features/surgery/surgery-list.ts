import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  map,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { format as formatJalali } from 'date-fns-jalali';

import { AuthService } from '../../core/services/auth.service';
import { RegistryService, SurgeryQuery } from '../../core/services/registry.service';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { abutmentLabel, surgeryKindLabel } from '../../shared/labels';
import { PbButton, PbPageHeader, PbSearchField, PbStatusChip } from '../../shared/ui';
import type { StatusTone } from '../../shared/ui';
import type {
  FollowUpFilter,
  FollowUpState,
  SurgeryQueueItem,
} from '../../core/models/common.model';

/**
 * The questions staff ask of the list, in the order they ask them. Each is a
 * window over the open follow-ups; the API decides what the window means in
 * dates, so the chips here never disagree with the dashboard.
 */
const FOLLOW_UP_FILTERS: readonly { value: FollowUpFilter; label: string; icon: string }[] = [
  { value: 'pending', label: 'surgery.filterPending', icon: 'pending_actions' },
  { value: 'week', label: 'surgery.filterWeek', icon: 'date_range' },
  { value: 'thisMonth', label: 'surgery.filterThisMonth', icon: 'calendar_month' },
  { value: 'nextMonth', label: 'surgery.filterNextMonth', icon: 'event_upcoming' },
];

/** How a follow-up reads on the card: the state is the API's, the colour is ours. */
const FOLLOW_UP_TONE: Record<FollowUpState, StatusTone> = {
  none: 'neutral',
  pending: 'neutral',
  due: 'warning',
  overdue: 'error',
  done: 'success',
};

function isFollowUpFilter(value: unknown): value is FollowUpFilter {
  return FOLLOW_UP_FILTERS.some((f) => f.value === value);
}

/**
 * The filters the dashboard links into. Read once from the URL on arrival;
 * the rest of the toolbar is session-only.
 */
function readUrlFilters(params: ParamMap): { q: string; followUp: FollowUpFilter | '' } {
  const followUp = params.get('followUp');
  return {
    q: params.get('q')?.trim() ?? '',
    followUp: isFollowUpFilter(followUp) ? followUp : '',
  };
}

@Component({
  selector: 'pb-surgery-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    EmptyState,
    LoadError,
    PersianNumberPipe,
    PbSearchField,
    PbPageHeader,
    PbButton,
    PbStatusChip,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './surgery-list.html',
  styleUrl: './surgery-list.scss',
})
export class SurgeryList {
  private readonly registry = inject(RegistryService);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly abutmentLabel = abutmentLabel;
  protected readonly kindLabel = surgeryKindLabel;
  protected readonly followUpFilters = FOLLOW_UP_FILTERS;

  // Seeded from the URL so a dashboard tile lands on the list it promised.
  private readonly urlFilters = readUrlFilters(this.route.snapshot.queryParamMap);
  protected readonly search = new FormControl(this.urlFilters.q, { nonNullable: true });
  protected readonly followUp = signal<FollowUpFilter | ''>(this.urlFilters.followUp);
  protected readonly page = signal(1);
  protected readonly limit = signal(25);

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly items = signal<SurgeryQueueItem[]>([]);
  protected readonly total = signal(0);
  /** The row whose follow-up switch is mid-flight, so it cannot be flipped twice. */
  protected readonly updating = signal<string | null>(null);
  protected readonly countLabel = computed(() => {
    const total = this.total();
    if (this.loading() || total === 0) return null;
    this.i18n.currentLang();
    const count = formatPersianCount(total);
    return this.i18n.instant('count.rows', { count });
  });

  /** A new search starts from page 1; page 3 of "Ali" says nothing about "Alireza". */
  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
      tap(() => this.page.set(1)),
    ),
    { initialValue: this.urlFilters.q },
  );

  /**
   * One persistent subscription, fed by the effect below. `switchMap` cancels
   * the in-flight request when a newer query arrives, so a slow "Ali" request
   * can no longer resolve after a faster "Alireza" one and overwrite it.
   */
  private readonly fetchTrigger$ = new Subject<SurgeryQuery>();

  /** Bumped by {@link retry} and after a write, to re-run the current query unchanged. */
  private readonly reloadTick = signal(0);

  constructor() {
    this.fetchTrigger$
      .pipe(
        switchMap((query) =>
          this.registry.surgeryQueue(query).pipe(
            // Keep the previous rows on screen under a banner rather than
            // blanking the list: an empty list reads as "nothing to do".
            catchError(() => {
              this.loading.set(false);
              this.failed.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.items.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      });

    effect(() => {
      this.reloadTick();
      const query: SurgeryQuery = {
        q: this.query() || undefined,
        followUp: this.followUp() || undefined,
        page: this.page(),
        limit: this.limit(),
        // Newest surgery first; a follow-up filter sorts by follow-up date instead.
        sortDir: 'DESC',
      };
      untracked(() => {
        this.loading.set(true);
        this.failed.set(false);
        this.fetchTrigger$.next(query);
      });
    });
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected toneFor(state: FollowUpState): StatusTone {
    return FOLLOW_UP_TONE[state];
  }

  /**
   * `toothPosition` on legacy rows is a whole imported phrase like "زیمر، ۶ و
   * ۷ راست پایین" — the brand is always its leading token, up to the first
   * comma (see `extractImplantBrand` on the API). Once that brand has its own
   * chip, repeating it here too just reads as the same word run twice.
   */
  protected toothPositionDisplay(item: SurgeryQueueItem): string {
    if (!item.implantBrand) return item.toothPosition;
    const commaIndex = item.toothPosition.search(/[,،]/);
    if (commaIndex !== -1) return item.toothPosition.slice(commaIndex + 1).trim();
    // No comma: the whole phrase may just be the brand name with nothing else
    // ever recorded, in which case there is no position left to show.
    const isBrandOnly =
      item.toothPosition.trim().toLowerCase() === item.implantBrand.trim().toLowerCase();
    return isBrandOnly ? '' : item.toothPosition;
  }

  protected hasActions(): boolean {
    return this.auth.can('editSurgery') || this.auth.can('archiveSurgery');
  }

  protected emptyHint(): string {
    return this.search.value || this.followUp() ? this.i18n.instant('filters.changeThem') : '';
  }

  /** A chip-listbox in single mode hands back the chosen value, or `undefined` when cleared. */
  protected setFollowUp(value: unknown): void {
    this.followUp.set(isFollowUpFilter(value) ? value : '');
    this.page.set(1);
  }

  /** The patient came in for the follow-up — or, switched off, did not after all. */
  protected setFollowUpDone(item: SurgeryQueueItem, done: boolean): void {
    // Today on the Jalali calendar, in the `yyyy/MM/dd` form the API parses.
    const followUpDoneAt = done ? formatJalali(new Date(), 'yyyy/MM/dd') : null;
    this.updating.set(item.id);
    this.registry.saveSurgery(item.id, { followUpDoneAt }).subscribe({
      next: () => {
        this.updating.set(null);
        this.snackBar.open(
          this.i18n.instant(done ? 'surgery.followUpMarkedDone' : 'surgery.followUpReopened'),
          this.i18n.instant('action.dismiss'),
        );
        this.retry();
      },
      // The switch snaps back with the reload; the interceptor has shown the error.
      error: () => {
        this.updating.set(null);
        this.retry();
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }

  /** A soft delete: the row leaves the list; the record itself is kept. */
  protected delete(item: SurgeryQueueItem): void {
    const data: ConfirmData = {
      title: this.i18n.instant('surgeryForm.deleteTitle'),
      message: this.i18n.instant('surgeryForm.deleteMessage', {
        name: item.recordedName || this.i18n.instant('patient.unnamed'),
      }),
      confirmLabel: this.i18n.instant('surgeryForm.deleteConfirm'),
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.registry.deleteSurgery(item.id).subscribe(() => {
          this.snackBar.open(
            this.i18n.instant('surgeryForm.deleted'),
            this.i18n.instant('action.dismiss'),
          );
          this.retry();
        });
      });
  }
}
