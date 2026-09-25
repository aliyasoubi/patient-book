import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
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

import { AuthService } from '../../core/services/auth.service';
import {
  RegistryKind,
  RegistryQuery,
  RegistryService,
} from '../../core/services/registry.service';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { LoadError } from '../../shared/components/load-error';
import {
  RegistryCaseDialog,
  RegistryCaseDialogData,
} from '../../shared/components/registry-case-dialog';
import { RegistryTable } from '../../shared/components/registry-table';
import { formatPersianCount } from '../../shared/pipes/persian-number.pipe';
import { PbPageHeader, PbSearchField } from '../../shared/ui';
import type { RegistryCase } from '../../core/models/common.model';

/** Everything that differs between the two registers' screens. */
const KINDS: Record<
  RegistryKind,
  {
    icon: string;
    title: string;
    searchAria: string;
    emptyTitle: string;
    /** Whether rows show phone and status; neither book keeps them now. */
    showDetails: boolean;
  }
> = {
  implant: {
    icon: 'deployed_code',
    title: 'implant.title',
    searchAria: 'implant.searchAria',
    emptyTitle: 'implant.emptyTitle',
    showDetails: false,
  },
  ortho: {
    icon: 'straighten',
    title: 'ortho.title',
    searchAria: 'ortho.searchAria',
    emptyTitle: 'ortho.emptyTitle',
    showDetails: false,
  },
};

/**
 * The implant and orthodontic registers — one screen, told apart by the
 * `kind` the route binds. Both number themselves independently of the main
 * patient file, so a row is shown by its own register number with the linked
 * patient file beside it, and an unlinked row is surfaced to be resolved.
 */
@Component({
  selector: 'pb-registry-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    RegistryTable,
    LoadError,
    PbSearchField,
    PbPageHeader,
    TranslatePipe,
  ],
  templateUrl: './registry-list.html',
  styleUrl: './registry-list.scss',
})
export class RegistryList {
  private readonly registry = inject(RegistryService);
  private readonly i18n = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  /** Bound from the route's `data`. */
  readonly kind = input.required<RegistryKind>();
  protected readonly ui = computed(() => KINDS[this.kind()]);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly page = signal(1);
  protected readonly limit = signal(25);
  protected readonly unlinkedOnly = signal(false);
  /** Deleted rows are only archived; this shows them so one can be brought back. */
  protected readonly archivedOnly = signal(false);
  /**
   * By register number — the one order this book has. Newest first by
   * default: the highest numbers are the cases being worked on now.
   */
  protected readonly sortDir = signal<'ASC' | 'DESC'>('DESC');

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly cases = signal<RegistryCase[]>([]);
  protected readonly total = signal(0);
  protected readonly countLabel = computed(() => {
    const total = this.total();
    if (this.loading() || total === 0) return null;
    this.i18n.currentLang();
    const count = formatPersianCount(total);
    return this.i18n.instant('count.records', { count });
  });

  /** A new search starts from page 1; page 3 of "Ali" says nothing about "Alireza". */
  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
      tap(() => this.page.set(1)),
    ),
    { initialValue: '' },
  );

  /**
   * One persistent subscription, fed by the effect below. `switchMap` cancels
   * the in-flight request when a newer query arrives, so a slow "Ali" request
   * can no longer resolve after a faster "Alireza" one and overwrite it.
   */
  private readonly fetchTrigger$ = new Subject<{ kind: RegistryKind; query: RegistryQuery }>();

  /** Bumped by {@link retry} and after a write, to re-run the current query unchanged. */
  private readonly reloadTick = signal(0);

  constructor() {
    this.fetchTrigger$
      .pipe(
        switchMap(({ kind, query }) =>
          this.registry.cases(kind, query).pipe(
            // Keep the previous rows on screen under a banner rather than
            // blanking the register: a blank register reads as "no cases".
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
        this.cases.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      });

    // `kind` is read inside the effect like any other input: the two routes
    // are separate entries so each gets its own instance today, and this
    // keeps that an implementation detail rather than something to remember.
    effect(() => {
      this.reloadTick();
      const kind = this.kind();
      const query: RegistryQuery = {
        q: this.query() || undefined,
        page: this.page(),
        limit: this.limit(),
        unlinkedOnly: this.unlinkedOnly() || undefined,
        archivedOnly: this.archivedOnly() || undefined,
        sortBy: 'registryNo',
        sortDir: this.sortDir(),
      };
      untracked(() => {
        this.loading.set(true);
        this.failed.set(false);
        this.fetchTrigger$.next({ kind, query });
      });
    });
  }

  protected retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  protected emptyHint(): string {
    return this.search.value || this.unlinkedOnly() || this.archivedOnly()
      ? this.i18n.instant('filters.changeThem')
      : '';
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
  }

  protected toggleSort(): void {
    this.sortDir.update((dir) => (dir === 'DESC' ? 'ASC' : 'DESC'));
    this.page.set(1);
  }

  protected toggleUnlinked(checked: boolean): void {
    this.unlinkedOnly.set(checked);
    this.page.set(1);
  }

  protected toggleArchived(checked: boolean): void {
    this.archivedOnly.set(checked);
    this.page.set(1);
  }

  protected edit(existing: RegistryCase): void {
    const data: RegistryCaseDialogData = { mode: 'edit', kind: this.kind(), existing };
    this.dialog
      .open(RegistryCaseDialog, { data, width: '480px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.snackBar.open(
          this.i18n.instant('registryForm.saved'),
          this.i18n.instant('action.dismiss'),
        );
        this.retry();
      });
  }

  /** A soft delete — the row reappears under "archived only", where it can be restored. */
  protected archive(c: RegistryCase): void {
    const data: ConfirmData = {
      title: this.i18n.instant('registryForm.deleteTitle'),
      message: this.i18n.instant('registryForm.deleteMessage', {
        number: c.registryNo,
        name: c.recordedName || this.i18n.instant('patient.unnamed'),
      }),
      confirmLabel: this.i18n.instant('registryForm.deleteConfirm'),
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.registry.deleteCase(this.kind(), c.id).subscribe(() => {
          this.snackBar.open(
            this.i18n.instant('registryForm.deleted'),
            this.i18n.instant('action.dismiss'),
          );
          this.retry();
        });
      });
  }

  protected restore(c: RegistryCase): void {
    this.registry.restoreCase(this.kind(), c.id).subscribe(() => {
      this.snackBar.open(
        this.i18n.instant('registryForm.restored'),
        this.i18n.instant('action.dismiss'),
      );
      this.retry();
    });
  }
}
