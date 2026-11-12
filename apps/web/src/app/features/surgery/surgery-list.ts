import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import type { PageEvent } from '@angular/material/paginator';
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

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { isHandledByCaller } from '../../core/interceptors/error.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { ListReturn } from '../../core/services/list-return.service';
import { RegistryService, SurgeryQuery } from '../../core/services/registry.service';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatJalaliLong } from '../../shared/pipes/jalali.pipe';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  PbAutoHeight,
  PbButton,
  PbFilterChips,
  PbIcon,
  PbPage,
  PbPageHeader,
  PbPaginator,
  PbSearchField,
  PbSwitcher,
  ToastService,
} from '../../shared/ui';
import type { FilterChipOption, SwitcherOption } from '../../shared/ui';
import { FollowUpRow, FollowUpRowSkeleton } from './follow-up-row';
import type {
  FollowUpFilter,
  FollowUpState,
  FollowUpStatus,
  SurgeryQueueItem,
} from '../../core/models/common.model';
import { SurgeryBookDialog, type SurgeryBookResult } from './surgery-book-dialog';
import { FollowUpContactDialog, type FollowUpContactDialogData } from './follow-up-contact-dialog';
import type { RecordContactInput } from '../../core/services/registry.service';
import { daysUntil, followUpDistance } from './follow-up-distance';

/**
 * The questions staff ask of the list, most urgent first. Each is a
 * window over the open follow-ups; the API decides what the window means in
 * dates, so the chips here never disagree with the dashboard.
 */
const FOLLOW_UP_FILTERS: readonly (FilterChipOption & { value: FollowUpFilter })[] = [
  // The front desk's day: who to ring today, whatever window they fall in.
  { value: 'callsToday', label: 'surgery.filterCallsToday', icon: 'call', translate: true },
  { value: 'overdue', label: 'surgery.filterOverdue', icon: 'event_busy', translate: true },
  { value: 'pending', label: 'surgery.filterPending', icon: 'pending_actions', translate: true },
  { value: 'week', label: 'surgery.filterWeek', icon: 'date_range', translate: true },
  { value: 'thisMonth', label: 'surgery.filterThisMonth', icon: 'calendar_month', translate: true },
  { value: 'nextMonth', label: 'surgery.filterNextMonth', icon: 'event_upcoming', translate: true },
  { value: 'booked', label: 'surgery.filterBooked', icon: 'event_available', translate: true },
  { value: 'declined', label: 'surgery.filterDeclined', icon: 'cancel', translate: true },
];

/** A row with what it shows worked out once per load, so the bindings hold still. */
interface QueueRow {
  item: SurgeryQueueItem;
  /** The headline of its "when" column. */
  when: string;
  /** The legacy tooth phrase, minus a brand shown on its own. */
  position: string;
  /** The day to call again has come. */
  callDue: boolean;
}

/** Groups down the sheet, most urgent first; a cancelled surgery last. */
type GroupKey = FollowUpState | 'off';
const GROUP_ORDER: readonly GroupKey[] = [
  'overdue',
  'due',
  'pending',
  'none',
  'booked',
  'declined',
  'off',
];
const GROUP_LABEL: Record<GroupKey, string> = {
  overdue: 'surgery.groupOverdue',
  due: 'surgery.groupDue',
  pending: 'surgery.groupPending',
  none: 'surgery.groupNone',
  booked: 'surgery.groupBooked',
  declined: 'surgery.groupDeclined',
  off: 'surgery.groupOff',
};

/** The views most asked for, on the segmented bar; the rest are chips under it. */
const PRIMARY_VIEWS: readonly (FollowUpFilter | '')[] = [
  '',
  'callsToday',
  'overdue',
  'pending',
  'week',
  'booked',
];

function isFollowUpFilter(value: unknown): value is FollowUpFilter {
  return FOLLOW_UP_FILTERS.some((f) => f.value === value);
}

/**
 * The filters the dashboard links into. Read once from the URL on arrival;
 * the rest of the toolbar is session-only.
 */
interface UrlFilters {
  q: string;
  followUp: FollowUpFilter | '';
  unlinked: boolean;
  archived: boolean;
  page: number;
  limit: number;
}

/** A whole number from 1 to `max`, or `fallback` for anything else. */
function countParam(value: string | null, fallback: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}

function readUrlFilters(params: ParamMap): UrlFilters {
  const followUp = params.get('followUp');
  return {
    q: params.get('q')?.trim() ?? '',
    followUp: isFollowUpFilter(followUp) ? followUp : '',
    unlinked: params.get('unlinked') === 'true',
    archived: params.get('archived') === 'true',
    page: countParam(params.get('page'), 1, 10_000),
    limit: countParam(params.get('limit'), 25, 100),
  };
}

@Component({
  selector: 'pb-surgery-list',
  standalone: true,
  imports: [
    PbAutoHeight,
    ReactiveFormsModule,
    EmptyState,
    LoadError,
    FollowUpRow,
    FollowUpRowSkeleton,
    PersianNumberPipe,
    PbSearchField,
    PbSwitcher,
    PbPageHeader,
    PbPage,
    PbPaginator,
    PbButton,
    PbFilterChips,
    PbIcon,
    MatIconModule,
    MatMenuModule,
    TranslatePipe,
  ],
  templateUrl: './surgery-list.html',
  styleUrl: './surgery-list.scss',
})
export class SurgeryList {
  private readonly registry = inject(RegistryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly listReturn = inject(ListReturn);
  private readonly i18n = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ApiErrorTranslator);
  protected readonly auth = inject(AuthService);
  /** The segmented bar: everything, then the windows asked of the list every day. */
  protected readonly views: SwitcherOption[] = PRIMARY_VIEWS.map((value) => ({
    value,
    label: value
      ? (FOLLOW_UP_FILTERS.find((f) => f.value === value)?.label ?? '')
      : 'surgery.viewAll',
  }));
  /** The windows asked now and then, as chips under the bar. */
  protected readonly moreViews = FOLLOW_UP_FILTERS.filter((f) => !PRIMARY_VIEWS.includes(f.value));
  /**
   * Which rows are listed at all, each its own switch: those not yet linked
   * to a patient file — to be linked from the form — and the archived ones.
   */
  protected readonly rowFilters: FilterChipOption[] = [
    { value: 'unlinked', label: 'surgery.unlinkedOnly', icon: 'link_off', translate: true },
    ...(this.auth.can('archiveSurgery')
      ? [{ value: 'archived', label: 'surgery.archivedOnly', icon: 'inventory_2', translate: true }]
      : []),
  ];

  // Seeded from the URL so a dashboard tile lands on the list it promised,
  // and a form opened from the list comes back to the same one.
  private readonly urlFilters = readUrlFilters(this.route.snapshot.queryParamMap);
  protected readonly search = new FormControl(this.urlFilters.q, { nonNullable: true });
  protected readonly followUp = signal<FollowUpFilter | ''>(this.urlFilters.followUp);
  /** Rows with no patient file yet, to be linked one by one. */
  protected readonly unlinkedOnly = signal(this.urlFilters.unlinked);
  /** Deleted rows are only archived; this shows them so one can be brought back. */
  protected readonly archivedOnly = signal(this.urlFilters.archived);
  protected readonly rowFiltersSelected = computed(() => [
    ...(this.unlinkedOnly() ? ['unlinked'] : []),
    ...(this.archivedOnly() ? ['archived'] : []),
  ]);
  /** One of the rarer questions is the one asked: the menu button holds the selection. */
  protected readonly moreActive = computed(() =>
    this.moreViews.some((v) => v.value === this.followUp()),
  );
  protected readonly moreLabel = computed(
    () => this.moreViews.find((v) => v.value === this.followUp())?.label ?? 'surgery.moreViews',
  );
  protected readonly page = signal(this.urlFilters.page);
  protected readonly limit = signal(this.urlFilters.limit);

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly items = signal<SurgeryQueueItem[]>([]);
  protected readonly total = signal(0);
  protected readonly rows = computed<QueueRow[]>(() => {
    this.i18n.currentLang();
    return this.items().map((item) => ({
      item,
      when: this.whenNote(item),
      position: this.toothPositionDisplay(item),
      callDue: this.callDue(item),
    }));
  });

  /**
   * The page's rows in urgency groups — overdue, due, waiting, booked,
   * cancelled — each keeping the order the API sent, so the eye starts at
   * what cannot wait and the colour of each group tells it where it is.
   */
  protected readonly groups = computed(() => {
    const byKey = new Map<GroupKey, QueueRow[]>();
    for (const row of this.rows()) {
      const key: GroupKey = row.item.status === 'cancelled' ? 'off' : row.item.followUpState;
      byKey.set(key, [...(byKey.get(key) ?? []), row]);
    }
    return GROUP_ORDER.filter((key) => byKey.has(key)).map((key) => ({
      key,
      label: GROUP_LABEL[key],
      rows: byKey.get(key) ?? [],
    }));
  });
  /** The row whose follow-up status is mid-save, so it cannot be changed twice. */
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
        unlinkedOnly: this.unlinkedOnly() || undefined,
        archivedOnly: this.archivedOnly() || undefined,
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

    // State → URL, as the patient register does: the search and filters
    // survive a reload, and a form opened from here returns to this list.
    // `replaceUrl`: one history entry, not one per keystroke or page.
    effect(() => {
      const queryParams = {
        q: this.query() || null,
        followUp: this.followUp() || null,
        unlinked: this.unlinkedOnly() ? 'true' : null,
        archived: this.archivedOnly() ? 'true' : null,
        page: this.page() > 1 ? this.page() : null,
        limit: this.limit() !== 25 ? this.limit() : null,
      };
      untracked(() => {
        const tree = this.router.createUrlTree([], { relativeTo: this.route, queryParams });
        this.listReturn.remember('/surgery', this.router.serializeUrl(tree));
        void this.router.navigateByUrl(tree, { replaceUrl: true });
      });
    });
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  /** The status can be changed from the card, as opposed to only shown. */
  protected canChangeStatus(): boolean {
    return this.auth.can('editSurgery') && !this.archivedOnly();
  }

  /**
   * The line under the follow-up date: how far away it is while the patient
   * is still to be called, the appointment once they have one, or that they
   * cancelled.
   */
  protected whenNote(item: SurgeryQueueItem): string {
    this.i18n.currentLang();
    switch (item.followUpState) {
      case 'booked':
        return item.followUpAppointmentAt
          ? this.i18n.instant('surgery.bookedOn', {
              date: formatJalaliLong(item.followUpAppointmentAt, this.i18n),
            })
          : this.i18n.instant('surgery.bookedNoDate');
      case 'declined':
        return this.i18n.instant('surgery.declinedLabel');
      default: {
        if (!item.followUpDate) return '';
        const { key, count } = followUpDistance(daysUntil(item.followUpDate.iso));
        return this.i18n.instant(key, count === null ? {} : { count: formatPersianCount(count) });
      }
    }
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

  protected emptyHint(): string {
    return this.search.value || this.followUp() || this.unlinkedOnly() || this.archivedOnly()
      ? this.i18n.instant('filters.changeThem')
      : '';
  }

  /** Each chip is its own switch; the list comes back as whichever are on. */
  protected setRowFilters(selected: string[]): void {
    this.unlinkedOnly.set(selected.includes('unlinked'));
    this.archivedOnly.set(selected.includes('archived'));
    this.page.set(1);
  }

  /** The one follow-up question asked of the list, or `undefined` once the chip is cleared. */
  protected setFollowUp(value: unknown): void {
    this.followUp.set(isFollowUpFilter(value) ? value : '');
    this.page.set(1);
  }

  /** Booking asks for a day, and closing a follow-up asks for confirmation. */
  protected setStatus(item: SurgeryQueueItem, status: FollowUpStatus): void {
    if (this.updating() || status === item.followUpStatus) return;
    if (status === 'booked') {
      this.bookAppointment(item);
      return;
    }
    if (status === 'declined') {
      this.confirmDecline(item);
      return;
    }
    this.saveStatus(
      item,
      { followUpStatus: status },
      item.followUpStatus,
      item.followUpAppointmentAt,
    );
  }

  private confirmDecline(item: SurgeryQueueItem): void {
    const data: ConfirmData = {
      title: this.i18n.instant('surgery.declineTitle'),
      message: this.i18n.instant('surgery.declineMessage', {
        name: item.recordedName || this.i18n.instant('patient.unnamed'),
      }),
      confirmLabel: this.i18n.instant('surgery.declineConfirm'),
      tone: 'warn',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
        data,
        width: '420px',
        maxWidth: '92vw',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed !== true || this.updating()) return;
        this.saveStatus(
          item,
          { followUpStatus: 'declined', expectedVersion: item.version },
          item.followUpStatus,
          item.followUpAppointmentAt,
        );
      });
  }

  /** A call was made: write down what it came to, and when to call again. */
  protected recordCall(item: SurgeryQueueItem): void {
    if (this.updating()) return;
    this.dialog
      .open<FollowUpContactDialog, FollowUpContactDialogData, RecordContactInput | undefined>(
        FollowUpContactDialog,
        { data: { item }, width: '480px', maxWidth: '92vw', autoFocus: false },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.updating.set(item.id);
        this.registry.recordContact(item.id, result).subscribe({
          next: () => {
            this.updating.set(null);
            this.toast.success(this.i18n.instant('followUpContact.saved'));
            this.retry();
          },
          error: (error: unknown) => {
            this.updating.set(null);
            if (isHandledByCaller(error)) {
              this.toast.error(this.errors.translate(error));
            }
            this.retry();
          },
        });
      });
  }

  /** The next call is due: today or a day already gone by. */
  protected callDue(item: SurgeryQueueItem): boolean {
    return !!item.nextContactAt && daysUntil(item.nextContactAt.iso) <= 0;
  }

  /** Ask for the appointment day; on a booked row this changes it, otherwise it books. */
  protected bookAppointment(item: SurgeryQueueItem): void {
    this.dialog
      .open<SurgeryBookDialog, { item: SurgeryQueueItem }, SurgeryBookResult | undefined>(
        SurgeryBookDialog,
        { data: { item }, width: '420px', maxWidth: '92vw' },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.saveStatus(
          item,
          { followUpStatus: 'booked', followUpAppointmentAt: result.date },
          item.followUpStatus,
          item.followUpAppointmentAt,
        );
      });
  }

  private saveStatus(
    item: SurgeryQueueItem,
    body: {
      followUpStatus: FollowUpStatus;
      followUpAppointmentAt?: string | null;
      expectedVersion?: number;
    },
    previous: FollowUpStatus,
    previousDay: string | null,
    undoing = false,
  ): void {
    this.updating.set(item.id);
    this.registry.saveSurgery(item.id, body).subscribe({
      next: (saved) => {
        this.updating.set(null);
        const ref = this.toast.success(this.i18n.instant('surgery.statusSaved'), {
          action: undoing ? undefined : this.i18n.instant('surgery.undo'),
        });
        if (!undoing) {
          ref.onAction().subscribe(() => {
            const back = previous === 'booked' && previousDay ? previousDay : null;
            // Against this save's version: once someone has booked or closed
            // the follow-up since, the Undo is refused rather than undo theirs.
            const expectedVersion = saved.version;
            this.saveStatus(
              item,
              previous === 'booked'
                ? { followUpStatus: previous, followUpAppointmentAt: back, expectedVersion }
                : { followUpStatus: previous, expectedVersion },
              body.followUpStatus,
              null,
              true,
            );
          });
        }
        this.retry();
      },
      // The card snaps back with the reload. A server or network failure has
      // already been shown by the interceptor; the statuses it leaves to
      // callers (a row deleted meanwhile, a rejected value) have no field to
      // sit under here, so they are shown here.
      error: (error: unknown) => {
        this.updating.set(null);
        if (isHandledByCaller(error)) {
          this.toast.error(this.errors.translate(error));
        }
        this.retry();
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }

  /** A soft delete — the row reappears under "archived only", where it can be restored. */
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
        this.registry.deleteSurgery(item.id).subscribe({
          next: () => this.removed('surgeryForm.deleted'),
          error: (error: unknown) => this.writeFailed(error),
        });
      });
  }

  protected restore(item: SurgeryQueueItem): void {
    this.registry.restoreSurgery(item.id).subscribe({
      next: () => this.removed('surgeryForm.restored'),
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  /**
   * The row has left this view. When it was the last one on a later page,
   * step back a page rather than land on an empty one that looks like
   * "nothing here".
   */
  private removed(message: string): void {
    this.toast.success(this.i18n.instant(message));
    if (this.items().length === 1 && this.page() > 1) {
      this.page.update((p) => p - 1);
    } else {
      this.retry();
    }
  }

  /**
   * The interceptor leaves 404 and 409 to the caller — a row someone else
   * already deleted or restored — so say what happened and show the list as
   * it now stands.
   */
  private writeFailed(error: unknown): void {
    if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) {
      this.toast.error(this.errors.translate(error));
    }
    this.retry();
  }
}
