import { BreakpointObserver } from '@angular/cdk/layout';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragStart,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ApplicationRef,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { PageEvent } from '@angular/material/paginator';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { AuthService } from '../../core/services/auth.service';
import { LabService } from '../../core/services/lab.service';
import { ListReturn } from '../../core/services/list-return.service';
import type {
  Lab,
  LabBoard as LabBoardData,
  LabCase,
  LabStage,
} from '../../core/models/common.model';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import {
  PbSwitcher,
  PbAutoHeight,
  PbButton,
  PbFilterChips,
  PbPage,
  PbPageHeader,
  PbPaginator,
  PbListToolbar,
  PbSearchField,
  PbSegmentedButton,
  PbSelectField,
  PbSurface,
  ToastService,
} from '../../shared/ui';
import type {
  SwitcherOption,
  FilterChipOption,
  SegmentOption,
  SelectOption,
} from '../../shared/ui';
import { LabCaseCard, LabCaseCardSkeleton } from './lab-case-card';
import { LabBookDialog, LabBookDialogData } from './lab-book-dialog';
import { LabReceiveDialog, LabReceiveDialogData } from './lab-receive-dialog';
import { LabSendDialog, LabSendDialogData } from './lab-send-dialog';
import type { LabReceiveParts, LabSendInput } from '../../core/services/lab.service';

interface Column {
  stage: LabStage;
  title: string;
  hint: string;
  icon: string;
  empty: string;
  cases: LabCase[];
}

const COLUMNS: readonly Omit<Column, 'cases'>[] = [
  {
    stage: 'at_lab',
    title: 'labs.atLab',
    hint: 'labs.atLabHint',
    icon: 'science',
    empty: 'labs.atLabEmpty',
  },
  {
    stage: 'at_clinic',
    title: 'labs.atClinic',
    hint: 'labs.atClinicHint',
    icon: 'home_health',
    empty: 'labs.atClinicEmpty',
  },
  {
    stage: 'booked',
    title: 'labs.booked',
    hint: 'labs.bookedHint',
    icon: 'event_available',
    empty: 'labs.bookedEmpty',
  },
  {
    stage: 'delivered',
    title: 'labs.delivered',
    hint: 'labs.deliveredHint',
    icon: 'task_alt',
    empty: 'labs.deliveredEmpty',
  },
];

/** A column named in the URL, if it is one. */
function columnParam(value: string | null): LabStage | null {
  return COLUMNS.find((c) => c.stage === value)?.stage ?? null;
}

/** A whole number from 1 to `max`, or `fallback` for anything else. */
function countParam(value: string | null, fallback: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}

/**
 * Where a card may be dropped from where it is: one column at a time. Between
 * the lab and the clinic a card goes both ways — work comes back and goes out
 * again — and from there it only goes forward, never skipping one: no
 * delivery without a booking. Backing out of a booking or a delivery is
 * "undo", and sending booked work back to the lab is its button; both are
 * deliberate menu items, not something a drop should do by accident.
 */
const MOVES: Record<LabStage, readonly LabStage[]> = {
  at_lab: ['at_clinic'],
  at_clinic: ['at_lab', 'booked'],
  booked: ['delivered'],
  delivered: [],
};

/** Which list of the board holds each column's cases. */
const BOARD_KEY = {
  at_lab: 'atLab',
  at_clinic: 'atClinic',
  booked: 'booked',
  delivered: 'delivered',
} as const satisfies Record<LabStage, keyof LabBoardData>;

const EMPTY_BOARD: LabBoardData = {
  atLab: [],
  atClinic: [],
  booked: [],
  delivered: [],
  partsChase: [],
};

/** Four columns need this much window beside the navigation rail; below it the board shows one at a time. */
const WIDE_BOARD = '(min-width: 1360px)';

/**
 * The lab board: every case by where its work is now — at the lab, back at
 * the clinic, delivered. Cards move with the buttons on them; on a wide
 * screen they can also be dragged, which runs exactly the same commands.
 */
@Component({
  selector: 'pb-lab-board',
  standalone: true,
  imports: [
    PbSwitcher,
    PbAutoHeight,
    ReactiveFormsModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatIconModule,
    MatMenuModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PbButton,
    PbFilterChips,
    PbPage,
    PbPageHeader,
    PbPaginator,
    PbListToolbar,
    PbSearchField,
    PbSegmentedButton,
    PbSelectField,
    PbSurface,
    LabCaseCard,
    LabCaseCardSkeleton,
  ],
  templateUrl: './lab-board.html',
  styleUrl: './lab-board.scss',
})
export class LabBoard {
  private readonly labs = inject(LabService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly appRef = inject(ApplicationRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly listReturn = inject(ListReturn);
  /**
   * The board's state as the URL left it: a dashboard tile's question, or the
   * board as it was before a form opened from it — the same search, lab,
   * question, column and archive page.
   */
  private readonly params = this.route.snapshot.queryParamMap;
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);
  private readonly errors = inject(ApiErrorTranslator);
  protected readonly auth = inject(AuthService);

  protected readonly canEdit = this.auth.can('editLabs');

  protected readonly wide = toSignal(
    inject(BreakpointObserver)
      .observe(WIDE_BOARD)
      .pipe(map((r) => r.matches)),
    { initialValue: true },
  );

  // -- Filters --------------------------------------------------------------

  protected readonly search = new FormControl(this.params.get('q')?.trim() ?? '', {
    nonNullable: true,
  });
  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
      // A new search starts at its first page: page 3 of the old one may be
      // past the end of the new one, and would read as "nothing found".
      tap(() => this.page.set(1)),
    ),
    { initialValue: this.search.value },
  );
  protected readonly labId = signal(this.params.get('lab') ?? '');
  /**
   * The board narrowed to one question: the late work at the lab, or the work
   * back with no booking. The dashboard's tiles land here with `?overdue=true`
   * and `?toBook=true`.
   */
  protected readonly focus = signal<'overdue' | 'toBook' | null>(
    this.params.get('toBook') === 'true'
      ? 'toBook'
      : this.params.get('overdue') === 'true'
        ? 'overdue'
        : null,
  );
  protected readonly overdueOnly = computed(() => this.focus() === 'overdue');
  protected readonly archivedOnly = signal(this.params.get('archived') === 'true');

  protected readonly focusFilter: FilterChipOption[] = [
    { value: 'overdue', label: 'labs.filterOverdue', icon: 'schedule', translate: true },
    { value: 'toBook', label: 'labs.filterToBook', icon: 'event_busy', translate: true },
  ];
  /** The board of work in hand, or the archive: two views, switched at the top. */
  protected readonly views: SwitcherOption[] = [
    { value: 'board', label: 'labs.viewBoard', icon: 'layout-dashboard' },
    { value: 'archive', label: 'labs.viewArchive', icon: 'box' },
  ];

  private readonly labList = signal<Lab[]>([]);
  protected readonly labOptions = computed<SelectOption[]>(() =>
    this.labList().map((l) => ({ value: l.id, label: l.name })),
  );

  // -- The board ----------------------------------------------------------------

  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private readonly data = signal<LabBoardData>(EMPTY_BOARD);
  /** The case whose move is in flight, so its buttons cannot be pressed twice. */
  protected readonly busy = signal<string | null>(null);

  protected readonly columns = computed<Column[]>(() => {
    const board = this.data();
    // Each question is about one column; the others empty out rather than
    // disappear, so the board keeps its shape.
    const focus = this.focus();
    const cases: Record<LabStage, LabCase[]> = {
      at_lab:
        focus === 'overdue'
          ? board.atLab.filter((c) => c.timeliness === 'overdue')
          : focus === 'toBook'
            ? []
            : board.atLab,
      at_clinic: focus === 'overdue' ? [] : board.atClinic,
      booked: focus ? [] : board.booked,
      delivered: focus ? [] : board.delivered,
    };
    return COLUMNS.map((column) => ({ ...column, cases: [...cases[column.stage]] }));
  });

  /**
   * Work that is back whose parts the lab still owes, in the lab's column: the
   * lab is who has to be called. Under the overdue filter, only the late ones.
   */
  protected readonly partsChase = computed(() => {
    const chase = this.data().partsChase;
    const focus = this.focus();
    if (focus === 'toBook') return [];
    return focus === 'overdue' ? chase.filter((c) => c.partsTimeliness === 'overdue') : chase;
  });

  protected readonly isEmpty = computed(() =>
    this.columns().every((column) => column.cases.length === 0),
  );

  /** On a narrow screen one column shows at a time; this picks which. */
  protected readonly shownColumn = signal<LabStage>(
    columnParam(this.params.get('column')) ?? (this.focus() === 'toBook' ? 'at_clinic' : 'at_lab'),
  );
  /** Short labels, no icons: three segments have to fit a phone's width. */
  protected readonly columnOptions: SegmentOption[] = [
    { value: 'at_lab', label: 'labs.atLabShort', translate: true },
    { value: 'at_clinic', label: 'labs.atClinicShort', translate: true },
    { value: 'booked', label: 'labs.bookedShort', translate: true },
    { value: 'delivered', label: 'labs.deliveredShort', translate: true },
  ];

  // -- The archive ---------------------------------------------------------------

  protected readonly archived = signal<LabCase[]>([]);
  protected readonly archivedTotal = signal(0);
  protected readonly page = signal(countParam(this.params.get('page'), 1, 10_000));
  protected readonly limit = signal(countParam(this.params.get('limit'), 25, 100));

  private readonly fetch$ = new Subject<{
    q: string;
    labId: string;
    archived: boolean;
    page: number;
    limit: number;
  }>();
  private readonly reloadTick = signal(0);

  constructor() {
    this.labs.labs().subscribe({ next: (labs) => this.labList.set(labs), error: () => undefined });

    this.fetch$
      .pipe(
        switchMap(({ q, labId, archived, page, limit }) => {
          const request: Observable<unknown> = archived
            ? this.labs.list({ q: q || undefined, archivedOnly: true, page, limit }).pipe(
                map((result) => {
                  this.archived.set(result.items);
                  this.archivedTotal.set(result.total);
                }),
              )
            : this.labs
                .board({ q: q || undefined, labId: labId || undefined })
                .pipe(map((board) => this.moveCards(() => this.data.set(board))));
          // Keep what is on screen under a banner: an empty board reads as "nothing at the lab".
          return request.pipe(
            catchError(() => {
              this.loading.set(false);
              this.failed.set(true);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.loading.set(false));

    effect(() => {
      this.reloadTick();
      const next = {
        q: this.query(),
        labId: this.labId(),
        archived: this.archivedOnly(),
        page: this.page(),
        limit: this.limit(),
      };
      untracked(() => {
        this.loading.set(true);
        this.failed.set(false);
        this.fetch$.next(next);
      });
    });

    // State → URL, as the patient register does: the board survives a reload,
    // and a form opened from it comes back to the same board. `replaceUrl`:
    // one history entry, not one per keystroke or column.
    effect(() => {
      const focus = this.focus();
      const archived = this.archivedOnly();
      const queryParams = {
        q: this.query() || null,
        lab: this.labId() || null,
        overdue: focus === 'overdue' ? 'true' : null,
        toBook: focus === 'toBook' ? 'true' : null,
        archived: archived ? 'true' : null,
        column: this.shownColumn() !== 'at_lab' ? this.shownColumn() : null,
        page: archived && this.page() > 1 ? this.page() : null,
        limit: archived && this.limit() !== 25 ? this.limit() : null,
      };
      untracked(() => {
        const tree = this.router.createUrlTree([], { relativeTo: this.route, queryParams });
        this.listReturn.remember('/labs', this.router.serializeUrl(tree));
        void this.router.navigateByUrl(tree, { replaceUrl: true });
      });
    });
  }

  /**
   * Cards travel to where the new board puts them rather than vanishing from
   * one column and appearing in another (FLIP). Before the new board renders,
   * every card's place is noted; after, each card starts drawn at its old
   * place and slides to its new one. A card crossing to another column lifts
   * on the way — up a little, a touch larger — and settles; cards in its old
   * column close the gap behind it; a card new to the board grows in where
   * it lands.
   */
  private moveCards(apply: () => void, dropped?: string): void {
    const root = this.host.nativeElement;
    const cards = () => [...root.querySelectorAll<HTMLElement>('[data-case-id]')];
    const before = new Map<string, DOMRect>();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const el of cards()) {
        const rect = el.getBoundingClientRect();
        if (rect.width) before.set(el.dataset['caseId']!, rect);
      }
    }
    apply();
    // A drop: render now, in the same frame the drag ends, so the card is
    // already where its preview landed — no frame of it back in its old column.
    if (dropped) this.appRef.tick();
    if (!before.size) return;
    const play = (): void => {
      for (const el of cards()) {
        const last = el.getBoundingClientRect();
        if (!last.width) continue;
        const id = el.dataset['caseId']!;
        // The dropped card is already in place: its preview settled there.
        if (id === dropped) continue;
        const first = before.get(id);
        if (!first) {
          el.animate(
            [
              { opacity: 0, transform: 'scale(0.94)' },
              { opacity: 1, transform: 'none' },
            ],
            {
              duration: 360,
              delay: 220,
              easing: 'cubic-bezier(0.2, 0, 0, 1)',
              fill: 'backwards',
            },
          );
          continue;
        }
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        const across = Math.abs(dx) > 40;
        el.style.position = 'relative';
        el.style.zIndex = across ? '5' : '';
        const run = el.animate(
          across
            ? [
                { transform: `translate(${dx}px, ${dy}px)`, offset: 0 },
                {
                  transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 14}px) scale(1.03) rotate(${dx > 0 ? -1.2 : 1.2}deg)`,
                  offset: 0.5,
                },
                { transform: 'none', offset: 1 },
              ]
            : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: across ? 560 : 340, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
        run.onfinish = run.oncancel = () => {
          el.style.position = '';
          el.style.zIndex = '';
        };
      }
    };
    // After a drop the new board is already drawn (the tick above): start
    // the cards moving in this same frame, so none is ever painted unmoved.
    if (dropped) play();
    else afterNextRender(play, { injector: this.injector });
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected setLab(id: string): void {
    this.labId.set(id);
    this.page.set(1);
  }

  protected setFocus(focus: 'overdue' | 'toBook' | null): void {
    this.focus.set(focus);
    if (focus) this.shownColumn.set(focus === 'toBook' ? 'at_clinic' : 'at_lab');
  }

  protected setArchived(on: boolean): void {
    this.archivedOnly.set(on);
    this.page.set(1);
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }

  // -- Moving a card ------------------------------------------------------------

  /**
   * Work that went with implant parts is received by asking about them: the
   * lab sends the parts apart from the work, and "received" alone would hide
   * which of the two is still owed.
   */
  protected receive(c: LabCase, onCancel?: () => void): void {
    if (!c.partsOutstanding) {
      this.run(c, this.labs.receive(c.id), 'labs.received');
      return;
    }
    this.dialog
      .open<LabReceiveDialog, LabReceiveDialogData, LabReceiveParts | undefined>(LabReceiveDialog, {
        data: { labCase: c },
        width: '480px',
        maxWidth: '92vw',
      })
      .afterClosed()
      .subscribe((parts) => {
        if (!parts) {
          onCancel?.();
          return;
        }
        this.run(c, this.labs.receive(c.id, parts), 'labs.received');
      });
  }

  /** The patient is given a day for the fitting — or the day is changed. */
  protected book(c: LabCase, onCancel?: () => void): void {
    this.dialog
      .open<LabBookDialog, LabBookDialogData, string | undefined>(LabBookDialog, {
        data: { labCase: c },
        width: '420px',
        maxWidth: '92vw',
      })
      .afterClosed()
      .subscribe((date) => {
        if (!date) {
          onCancel?.();
          return;
        }
        this.run(c, this.labs.book(c.id, date), 'labs.bookedDone');
      });
  }

  protected deliver(c: LabCase): void {
    this.run(c, this.labs.deliver(c.id), 'labs.deliveredDone');
  }

  protected sendAgain(c: LabCase, onCancel?: () => void): void {
    const data: LabSendDialogData = { labCase: c };
    this.dialog
      .open<LabSendDialog, LabSendDialogData, LabSendInput | undefined>(LabSendDialog, {
        data,
        width: '480px',
        maxWidth: '92vw',
      })
      .afterClosed()
      .subscribe((input) => {
        if (!input) {
          onCancel?.();
          return;
        }
        this.run(c, this.labs.send(c.id, input), 'labs.sent');
      });
  }

  protected partsReturned(c: LabCase): void {
    this.busy.set(c.id);
    this.labs.setPartsReturned(c.id, true).subscribe({
      next: () => {
        this.busy.set(null);
        const ref = this.toast.success(this.i18n.instant('labs.partsReturnedDone'), {
          action: this.i18n.instant('labs.undo'),
        });
        ref.onAction().subscribe(() =>
          this.labs.setPartsReturned(c.id, false).subscribe({
            next: () => this.reload(),
            error: (error: unknown) => this.writeFailed(error),
          }),
        );
        this.reload();
      },
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  protected undo(c: LabCase): void {
    this.busy.set(c.id);
    this.labs.undo(c.id, c.version).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.success(this.i18n.instant('labs.undone'));
        this.reload();
      },
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  /** A soft delete — the case moves to the archive, where it can be restored. */
  protected archive(c: LabCase): void {
    const data: ConfirmData = {
      title: this.i18n.instant('labs.archiveTitle'),
      message: this.i18n.instant('labs.archiveMessage', {
        name: c.recordedName || this.i18n.instant('patient.unnamed'),
      }),
      confirmLabel: this.i18n.instant('labs.archiveConfirm'),
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.labs.archive(c.id).subscribe({
          next: () => {
            this.toast.success(this.i18n.instant('labs.archived'));
            this.reload();
          },
          error: (error: unknown) => this.writeFailed(error),
        });
      });
  }

  protected restore(c: LabCase): void {
    this.labs.restore(c.id).subscribe({
      next: () => {
        this.toast.success(this.i18n.instant('labs.restored'));
        if (this.archived().length === 1 && this.page() > 1) this.page.update((p) => p - 1);
        else this.reload();
      },
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  // -- Dragging ---------------------------------------------------------------------

  /** How many cards a column's skeleton shows on first load: about what it usually holds. */
  protected skeletonCards(stage: LabStage): number[] {
    const n = { at_lab: 3, at_clinic: 2, booked: 2, delivered: 1 }[stage];
    return Array.from({ length: n }, (_, i) => i);
  }

  /** The case being dragged, and the column it is over: they light the board up. */
  protected readonly dragging = signal<LabCase | null>(null);
  protected readonly over = signal<LabStage | null>(null);

  /** While dragging: whether this column takes the card ('target'), is its home, or is out of reach. */
  protected dropState(stage: LabStage): 'target' | 'home' | 'blocked' | null {
    const c = this.dragging();
    if (!c) return null;
    if (c.stage === stage) return 'home';
    return MOVES[c.stage].includes(stage) ? 'target' : 'blocked';
  }

  /** The dragged card's height, to hold its place in the column it left. */
  protected readonly dragHeight = signal(0);

  protected dragStarted(c: LabCase, event: CdkDragStart): void {
    this.dragHeight.set(event.source.element.nativeElement.getBoundingClientRect().height);
    this.over.set(c.stage);
    this.dragging.set(c);
  }

  protected dragEnded(): void {
    this.dragging.set(null);
    this.over.set(null);
  }

  /** Only a drop that is a real move lights up a column. */
  protected readonly canEnter = (drag: CdkDrag<LabCase>, drop: CdkDropList<LabCase[]>): boolean =>
    MOVES[drag.data.stage].includes(drop.id as LabStage);

  protected onDrop(event: CdkDragDrop<LabCase[], LabCase[], LabCase>): void {
    if (event.previousContainer === event.container) return;
    const c = event.item.data;
    const to = event.container.id as LabStage;
    // The card stays where it was dropped while the command runs: the board
    // is redrawn with it there at once, the cards around it easing aside.
    // The reload that follows puts it in its real place, or back where it
    // came from if the move is cancelled — travelling either way.
    const key = BOARD_KEY;
    const board = this.data();
    const target = board[key[to]].filter((x) => x.id !== c.id);
    target.splice(Math.min(event.currentIndex, target.length), 0, { ...c, stage: to });
    this.moveCards(
      () =>
        this.data.set({
          ...board,
          [key[c.stage]]: board[key[c.stage]].filter((x) => x.id !== c.id),
          [key[to]]: target,
        }),
      c.id,
    );
    if (c.stage === 'at_lab' && to === 'at_clinic') this.receive(c, () => this.reload());
    else if (c.stage === 'at_clinic' && to === 'at_lab') this.sendAgain(c, () => this.reload());
    else if (c.stage === 'at_clinic' && to === 'booked') this.book(c, () => this.reload());
    else if (c.stage === 'booked' && to === 'delivered') this.deliver(c);
    else this.reload();
  }

  /**
   * Run a move, then offer to take it back: the wrong button is the commonest
   * mistake on a board, and an undo right there beats a confirmation before.
   */
  private run(c: LabCase, request: Observable<LabCase>, message: string): void {
    this.busy.set(c.id);
    request.subscribe({
      next: (moved) => {
        this.busy.set(null);
        const ref = this.toast.success(this.i18n.instant(message, { name: c.recordedName }), {
          action: this.i18n.instant('labs.undo'),
        });
        ref.onAction().subscribe(() => this.undo(moved));
        this.reload();
      },
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  /**
   * The interceptor leaves 404 and 409 to the caller: a case someone else has
   * moved, edited or archived meanwhile. Say so and show the board as it is.
   */
  private writeFailed(error: unknown): void {
    this.busy.set(null);
    if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) {
      this.toast.error(this.errors.translate(error));
    }
    this.reload();
  }
}
