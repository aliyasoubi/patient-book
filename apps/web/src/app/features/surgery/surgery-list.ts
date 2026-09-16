import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
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
import { RegistryService, SurgeryQuery } from '../../core/services/registry.service';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { abutmentLabel, surgeryStatusLabel } from '../../shared/labels';
import { PbButton, PbCheckboxField, PbPageHeader, PbSearchField, PbStatusChip } from '../../shared/ui';
import type { SurgeryQueueItem } from '../../core/models/common.model';

@Component({
  selector: 'pb-surgery-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    EmptyState,
    LoadError,
    PersianNumberPipe,
    PbSearchField,
    PbCheckboxField,
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
  private readonly i18n = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly abutmentLabel = abutmentLabel;
  protected readonly statusLabel = surgeryStatusLabel;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = signal<'' | 'scheduled' | 'completed' | 'cancelled'>('');
  protected readonly mismatchedOnly = signal(false);
  /** Deleted rows are only archived; this shows them so one can be brought back. */
  protected readonly archivedOnly = signal(false);
  protected readonly page = signal(1);
  protected readonly limit = signal(25);

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly items = signal<SurgeryQueueItem[]>([]);
  protected readonly total = signal(0);
  protected readonly countLabel = computed(() => {
    const total = this.total();
    if (this.loading() || total === 0) return null;
    this.i18n.currentLang();
    const count = formatPersianCount(total);
    return this.i18n.instant('count.rows', { count });
  });

  /** Rows whose register number has been reused for someone else. */
  protected readonly mismatchCount = computed(
    () => this.items().filter((i) => i.hasNameMismatch).length,
  );

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
  private readonly fetchTrigger$ = new Subject<SurgeryQuery>();

  /** Bumped by {@link retry} and after a write, to re-run the current query unchanged. */
  private readonly reloadTick = signal(0);

  constructor() {
    this.fetchTrigger$
      .pipe(
        switchMap((query) =>
          this.registry.surgeryQueue(query).pipe(
            // Keep the previous rows on screen under a banner rather than
            // blanking the list: an empty queue reads as "no surgeries".
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
        status: this.status() || undefined,
        mismatchedOnly: this.mismatchedOnly() || undefined,
        archivedOnly: this.archivedOnly() || undefined,
        page: this.page(),
        limit: this.limit(),
        sortDir: 'ASC',
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

  protected hasActions(item: SurgeryQueueItem): boolean {
    if (item.patient?.mobile) return true;
    return this.archivedOnly()
      ? this.auth.can('archiveSurgery')
      : this.auth.can('editSurgery') || this.auth.can('archiveSurgery');
  }

  protected emptyHint(): string {
    return this.search.value || this.status() || this.archivedOnly()
      ? this.i18n.instant('filters.changeThem')
      : '';
  }

  protected setStatus(value: '' | 'scheduled' | 'completed' | 'cancelled'): void {
    this.status.set(value);
    this.page.set(1);
  }

  protected toggleMismatched(checked: boolean): void {
    this.mismatchedOnly.set(checked);
    this.page.set(1);
  }

  protected toggleArchived(checked: boolean): void {
    this.archivedOnly.set(checked);
    this.page.set(1);
  }

  protected restore(item: SurgeryQueueItem): void {
    this.registry.restoreSurgery(item.id).subscribe(() => {
      this.snackBar.open(
        this.i18n.instant('surgeryForm.restored'),
        this.i18n.instant('action.dismiss'),
      );
      this.retry();
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
