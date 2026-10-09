import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
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
} from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { AuthService } from '../../core/services/auth.service';
import { InventoryQuery, InventoryService } from '../../core/services/inventory.service';
import type {
  ExpiryState,
  InventoryCategory,
  InventoryFilter,
  InventoryItem,
  InventoryMovementKind,
} from '../../core/models/common.model';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  expiryLabel,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_ICONS,
  INVENTORY_MOVEMENT_ICONS,
  inventoryCategoryLabel,
  inventoryMovementLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import {
  PbButton,
  PbFilterChips,
  PbIconButton,
  PbPage,
  PbPageHeader,
  PbSearchField,
  PbSelectField,
  PbStatusChip,
} from '../../shared/ui';
import type { FilterChipOption, SelectOption, StatusTone } from '../../shared/ui';
import {
  InventoryItemDialog,
  type InventoryItemDialogData,
  type InventoryItemDialogResult,
} from './inventory-item-dialog';
import {
  InventoryMovementDialog,
  type InventoryMovementDialogData,
} from './inventory-movement-dialog';
import { InventoryHistoryDialog } from './inventory-history-dialog';

/**
 * The questions staff ask of their stock, one at a time. The API decides what
 * each means, and the dashboard counts the first and last the same way.
 */
const FILTERS: readonly (FilterChipOption & { value: InventoryFilter })[] = [
  { value: 'reorder', label: 'inventory.filterReorder', icon: 'shopping_cart', translate: true },
  { value: 'out', label: 'inventory.filterOut', icon: 'remove_shopping_cart', translate: true },
  { value: 'expiry', label: 'inventory.filterExpiry', icon: 'hourglass_bottom', translate: true },
];

const EXPIRY_TONE: Record<ExpiryState, StatusTone> = {
  ok: 'neutral',
  expiring: 'warning',
  expired: 'error',
};

/** The rarer moves; use and receive have their own buttons on the row. */
const MENU_MOVES: readonly InventoryMovementKind[] = ['discard', 'count'];

/** A run of one category's items, under its heading. */
interface Shelf {
  category: InventoryCategory | null;
  items: InventoryItem[];
}

function isFilter(value: unknown): value is InventoryFilter {
  return FILTERS.some((f) => f.value === value);
}

function isCategory(value: unknown): value is InventoryCategory {
  return INVENTORY_CATEGORIES.includes(value as InventoryCategory);
}

/** The filters the dashboard links into, read once on arrival. */
function readUrlFilters(params: ParamMap): {
  q: string;
  filter: InventoryFilter | '';
  category: InventoryCategory | '';
} {
  const filter = params.get('filter');
  const category = params.get('category');
  return {
    q: params.get('q')?.trim() ?? '',
    filter: isFilter(filter) ? filter : '',
    category: isCategory(category) ? category : '',
  };
}

/**
 * The clinic's shelves, whole and grouped by category, as a stock list reads
 * best — a few hundred items is one page, not ten. Use and receive are one
 * tap from the row; everything else waits in its menu.
 */
@Component({
  selector: 'pb-inventory-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PersianNumberPipe,
    PbButton,
    PbFilterChips,
    PbIconButton,
    PbPage,
    PbPageHeader,
    PbSearchField,
    PbSelectField,
    PbStatusChip,
  ],
  templateUrl: './inventory-list.html',
  styleUrl: './inventory-list.scss',
})
export class InventoryList {
  private readonly inventory = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(TranslateService);
  private readonly errors = inject(ApiErrorTranslator);
  protected readonly auth = inject(AuthService);

  protected readonly filters = FILTERS;
  protected readonly menuMoves = MENU_MOVES;
  protected readonly moveIcons = INVENTORY_MOVEMENT_ICONS;
  protected readonly categoryIcons = INVENTORY_CATEGORY_ICONS;
  protected readonly categoryLabel = inventoryCategoryLabel;
  protected readonly unitLabel = inventoryUnitLabel;
  protected readonly moveLabel = inventoryMovementLabel;
  protected readonly expiryLabel = expiryLabel;
  protected readonly categoryOptions: SelectOption[] = INVENTORY_CATEGORIES.map((c) => ({
    value: c,
    label: inventoryCategoryLabel(c),
    translate: true,
  }));
  protected readonly archiveFilter: FilterChipOption[] = [
    { value: 'archived', label: 'inventory.archivedOnly', icon: 'inventory_2', translate: true },
  ];

  private readonly urlFilters = readUrlFilters(this.route.snapshot.queryParamMap);
  protected readonly search = new FormControl(this.urlFilters.q, { nonNullable: true });
  protected readonly filter = signal<InventoryFilter | ''>(this.urlFilters.filter);
  protected readonly category = signal<InventoryCategory | ''>(this.urlFilters.category);
  protected readonly archivedOnly = signal(false);
  protected readonly filterSelected = computed(() => {
    const value = this.filter();
    return value ? [value] : [];
  });

  protected readonly loading = signal(false);
  /** The most recent request failed; whatever rows are shown are stale. */
  protected readonly failed = signal(false);
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly countLabel = computed(() => {
    const total = this.items().length;
    if (this.loading() || total === 0) return null;
    this.i18n.currentLang();
    return this.i18n.instant('count.items', { count: formatPersianCount(total) });
  });

  /**
   * Shelf by shelf, in the order the API sends them. Expiring stock is listed
   * soonest first instead, across categories, so it is one run with no heading.
   */
  protected readonly shelves = computed<Shelf[]>(() => {
    const items = this.items();
    if (this.filter() === 'expiry') return items.length ? [{ category: null, items }] : [];
    const shelves: Shelf[] = [];
    for (const item of items) {
      const last = shelves.at(-1);
      if (last?.category === item.category) last.items.push(item);
      else shelves.push({ category: item.category, items: [item] });
    }
    return shelves;
  });

  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: this.urlFilters.q },
  );

  /** One subscription; `switchMap` drops a slower, older answer. */
  private readonly fetchTrigger$ = new Subject<InventoryQuery>();
  private readonly reloadTick = signal(0);

  constructor() {
    this.fetchTrigger$
      .pipe(
        switchMap((query) =>
          this.inventory.list(query).pipe(
            catchError(() => {
              this.loading.set(false);
              this.failed.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((items) => {
        this.items.set(items);
        this.loading.set(false);
      });

    effect(() => {
      this.reloadTick();
      const query: InventoryQuery = {
        q: this.query() || undefined,
        category: this.category() || undefined,
        filter: this.filter() || undefined,
        archivedOnly: this.archivedOnly() || undefined,
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

  protected canEdit(): boolean {
    return this.auth.can('editInventory');
  }

  protected setFilter(value: unknown): void {
    this.filter.set(isFilter(value) ? value : '');
  }

  protected setCategory(value: string): void {
    this.category.set(isCategory(value) ? value : '');
  }

  protected toggleArchived(checked: boolean): void {
    this.archivedOnly.set(checked);
  }

  protected expiryTone(item: InventoryItem): StatusTone {
    return EXPIRY_TONE[item.expiryState ?? 'ok'];
  }

  protected emptyHint(): string {
    if (this.search.value || this.filter() || this.category() || this.archivedOnly()) {
      return this.i18n.instant('filters.changeThem');
    }
    return this.canEdit() ? this.i18n.instant('inventory.emptyHint') : '';
  }

  protected addItem(): void {
    this.openItemDialog({ category: this.category() || undefined });
  }

  /** Another size, shade or model of the same thing: everything but those carried over. */
  protected addSimilar(item: InventoryItem): void {
    this.openItemDialog({ template: item });
  }

  protected edit(item: InventoryItem): void {
    this.openItemDialog({ item });
  }

  protected move(item: InventoryItem, kind: InventoryMovementKind): void {
    const data: InventoryMovementDialogData = { item, kind };
    this.dialog
      .open(InventoryMovementDialog, { data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        // In place, not reloaded: a row that just left the filter stays until
        // the next search, rather than vanishing under the hand that moved it.
        this.items.update((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
        this.snackBar.open(
          this.i18n.instant('inventoryMove.recorded', {
            kind: this.i18n.instant(inventoryMovementLabel(kind)),
            // «Supe Line 4x12», not «Supe Line»: a line's sizes share its name.
            name: [saved.name, saved.spec].filter(Boolean).join(' '),
            count: formatPersianCount(saved.quantity),
            unit: this.i18n.instant(inventoryUnitLabel(saved.unit)),
          }),
          this.i18n.instant('action.dismiss'),
        );
      });
  }

  protected history(item: InventoryItem): void {
    const ref = this.dialog.open(InventoryHistoryDialog, { data: item, maxWidth: '96vw' });
    // A batch corrected there can move the item's expiry.
    ref.afterClosed().subscribe(() => {
      if (ref.componentInstance.changed) this.retry();
    });
  }

  /** A soft delete: the item reappears under the archive chip, to be restored. */
  protected archive(item: InventoryItem): void {
    const data: ConfirmData = {
      title: this.i18n.instant('inventory.archiveTitle'),
      message: this.i18n.instant('inventory.archiveMessage', { name: item.name }),
      confirmLabel: this.i18n.instant('inventory.archiveConfirm'),
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.inventory.archive(item.id).subscribe({
          next: () => this.changed('inventory.archived'),
          error: (error: unknown) => this.writeFailed(error),
        });
      });
  }

  protected restore(item: InventoryItem): void {
    this.inventory.restore(item.id).subscribe({
      next: () => this.changed('inventory.restored'),
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  private openItemDialog(data: InventoryItemDialogData): void {
    this.dialog
      .open<InventoryItemDialog, InventoryItemDialogData, InventoryItemDialogResult>(
        InventoryItemDialog,
        {
          data,
          // A similar item is new in its size alone: start there.
          autoFocus: data.template ? '.item-form__spec input' : 'first-tabbable',
          maxWidth: '96vw',
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        if (result === 'conflict') {
          this.snackBar.open(
            this.i18n.instant('error.inventoryItemModified'),
            this.i18n.instant('action.dismiss'),
            { duration: 6000 },
          );
          this.retry();
          return;
        }
        this.changed(data.item ? 'inventoryForm.saved' : 'inventoryForm.created');
      });
  }

  private changed(message: string): void {
    this.snackBar.open(this.i18n.instant(message), this.i18n.instant('action.dismiss'));
    this.retry();
  }

  /** Someone else archived, restored or re-added it first: say so, show the list as it is. */
  private writeFailed(error: unknown): void {
    if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) {
      this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
        duration: 6000,
      });
    }
    this.retry();
  }
}
