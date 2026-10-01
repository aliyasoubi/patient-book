import { BreakpointObserver } from '@angular/cdk/layout';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
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
} from 'rxjs';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { AuthService } from '../../core/services/auth.service';
import { LabService } from '../../core/services/lab.service';
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
  PbButton,
  PbFilterChips,
  PbPage,
  PbPageHeader,
  PbPaginator,
  PbSearchField,
  PbSegmentedButton,
  PbSelectField,
  PbSurface,
} from '../../shared/ui';
import type { FilterChipOption, SegmentOption, SelectOption } from '../../shared/ui';
import { LabCaseCard } from './lab-case-card';
import { LabSendDialog, LabSendDialogData } from './lab-send-dialog';
import type { LabSendInput } from '../../core/services/lab.service';

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
    stage: 'delivered',
    title: 'labs.delivered',
    hint: 'labs.deliveredHint',
    icon: 'task_alt',
    empty: 'labs.deliveredEmpty',
  },
];

/**
 * Where a card may be dropped from where it is: exactly the moves its buttons
 * make. A delivered case goes nowhere by dragging — taking a delivery back is
 * "undo", a deliberate menu item.
 */
const MOVES: Record<LabStage, readonly LabStage[]> = {
  at_lab: ['at_clinic'],
  at_clinic: ['at_lab', 'delivered'],
  delivered: [],
};

const EMPTY_BOARD: LabBoardData = { atLab: [], atClinic: [], delivered: [] };

/** Three columns need this much window beside the navigation rail; below it the board shows one at a time. */
const WIDE_BOARD = '(min-width: 1200px)';

/**
 * The lab board: every case by where its work is now — at the lab, back at
 * the clinic, delivered. Cards move with the buttons on them; on a wide
 * screen they can also be dragged, which runs exactly the same commands.
 */
@Component({
  selector: 'pb-lab-board',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PbButton,
    PbFilterChips,
    PbPage,
    PbPageHeader,
    PbPaginator,
    PbSearchField,
    PbSegmentedButton,
    PbSelectField,
    PbSurface,
    LabCaseCard,
  ],
  templateUrl: './lab-board.html',
  styleUrl: './lab-board.scss',
})
export class LabBoard {
  private readonly labs = inject(LabService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
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

  protected readonly search = new FormControl(
    this.route.snapshot.queryParamMap.get('q')?.trim() ?? '',
    { nonNullable: true },
  );
  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: this.search.value },
  );
  protected readonly labId = signal('');
  /** The dashboard's tile lands here with `?overdue=true`. */
  protected readonly overdueOnly = signal(
    this.route.snapshot.queryParamMap.get('overdue') === 'true',
  );
  protected readonly archivedOnly = signal(false);

  protected readonly overdueFilter: FilterChipOption[] = [
    { value: 'overdue', label: 'labs.filterOverdue', icon: 'schedule', translate: true },
  ];
  protected readonly archiveFilter: FilterChipOption[] = [
    { value: 'archived', label: 'labs.archivedOnly', icon: 'inventory_2', translate: true },
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
    // Overdue is a question about the lab's column only; the others empty out
    // rather than disappear, so the board keeps its shape.
    const overdue = this.overdueOnly();
    const cases: Record<LabStage, LabCase[]> = {
      at_lab: overdue ? board.atLab.filter((c) => c.timeliness === 'overdue') : board.atLab,
      at_clinic: overdue ? [] : board.atClinic,
      delivered: overdue ? [] : board.delivered,
    };
    return COLUMNS.map((column) => ({ ...column, cases: [...cases[column.stage]] }));
  });

  protected readonly isEmpty = computed(() =>
    this.columns().every((column) => column.cases.length === 0),
  );

  /** On a narrow screen one column shows at a time; this picks which. */
  protected readonly shownColumn = signal<LabStage>('at_lab');
  /** Short labels, no icons: three segments have to fit a phone's width. */
  protected readonly columnOptions: SegmentOption[] = [
    { value: 'at_lab', label: 'labs.atLabShort', translate: true },
    { value: 'at_clinic', label: 'labs.atClinicShort', translate: true },
    { value: 'delivered', label: 'labs.deliveredShort', translate: true },
  ];

  // -- The archive ---------------------------------------------------------------

  protected readonly archived = signal<LabCase[]>([]);
  protected readonly archivedTotal = signal(0);
  protected readonly page = signal(1);
  protected readonly limit = signal(25);

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
                .pipe(map((board) => this.data.set(board)));
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
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected setLab(id: string): void {
    this.labId.set(id);
  }

  protected setOverdue(on: boolean): void {
    this.overdueOnly.set(on);
    if (on) this.shownColumn.set('at_lab');
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

  protected receive(c: LabCase): void {
    this.run(c, this.labs.receive(c.id), 'labs.received');
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
        const ref = this.snackBar.open(
          this.i18n.instant('labs.partsReturnedDone'),
          this.i18n.instant('labs.undo'),
          { duration: 8000 },
        );
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
        this.snackBar.open(this.i18n.instant('labs.undone'), this.i18n.instant('action.dismiss'));
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
            this.snackBar.open(
              this.i18n.instant('labs.archived'),
              this.i18n.instant('action.dismiss'),
            );
            this.reload();
          },
          error: (error: unknown) => this.writeFailed(error),
        });
      });
  }

  protected restore(c: LabCase): void {
    this.labs.restore(c.id).subscribe({
      next: () => {
        this.snackBar.open(this.i18n.instant('labs.restored'), this.i18n.instant('action.dismiss'));
        if (this.archived().length === 1 && this.page() > 1) this.page.update((p) => p - 1);
        else this.reload();
      },
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  // -- Dragging ---------------------------------------------------------------------

  /** Only a drop that is a real move lights up a column. */
  protected readonly canEnter = (drag: CdkDrag<LabCase>, drop: CdkDropList<LabCase[]>): boolean =>
    MOVES[drag.data.stage].includes(drop.id as LabStage);

  protected onDrop(event: CdkDragDrop<LabCase[], LabCase[], LabCase>): void {
    if (event.previousContainer === event.container) return;
    const c = event.item.data;
    const to = event.container.id as LabStage;
    // Show the card where it was dropped while the command runs; the reload
    // that follows puts it in its real place, or back where it came from.
    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );
    if (c.stage === 'at_lab' && to === 'at_clinic') this.receive(c);
    else if (c.stage === 'at_clinic' && to === 'at_lab') this.sendAgain(c, () => this.reload());
    else if (c.stage === 'at_clinic' && to === 'delivered') this.deliver(c);
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
        const ref = this.snackBar.open(
          this.i18n.instant(message, { name: c.recordedName }),
          this.i18n.instant('labs.undo'),
          { duration: 8000 },
        );
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
      this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
        duration: 6000,
      });
    }
    this.reload();
  }
}
