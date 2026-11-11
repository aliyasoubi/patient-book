import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
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
  InventoryCategory,
  InventoryFilter,
  InventoryItem,
  InventoryMovementKind,
} from '../../core/models/common.model';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import {
  formatPersianCount,
  PersianCountPipe,
  PersianNumberPipe,
} from '../../shared/pipes/persian-number.pipe';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_ICONS,
  inventoryCategoryLabel,
  inventoryMovementLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import {
  PbButton,
  PbFilterChips,
  PbPage,
  PbPageHeader,
  PbSearchField,
  PbIcon,
  ToastService,
} from '../../shared/ui';
import type { FilterChipOption, StatTileTone } from '../../shared/ui';
import { StockRow } from './stock-row';
import { filterCounts, shelfBrands, shelfFlags, type ShelfFlags } from './inventory-overview';
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
 * Everything empty is not an alarm — most of it is never stocked — so that
 * tile only lists; the reorder tile is the one that asks.
 */
const FILTERS: readonly (FilterChipOption & { value: InventoryFilter; tone: StatTileTone })[] = [
  {
    value: 'reorder',
    label: 'inventory.filterReorder',
    icon: 'shopping_cart',
    translate: true,
    tone: 'warn',
  },
  {
    value: 'out',
    label: 'inventory.filterOut',
    icon: 'remove_shopping_cart',
    translate: true,
    tone: 'neutral',
  },
  {
    value: 'expiry',
    label: 'inventory.filterExpiry',
    icon: 'hourglass_bottom',
    translate: true,
    tone: 'warn',
  },
];

/** A run of one category's items, under its heading. */
interface Shelf {
  category: InventoryCategory | null;
  items: InventoryItem[];
  flags: ShelfFlags;
  /** Chips to narrow a long shelf to one brand; none for a short one. */
  brands: FilterChipOption[];
  /** The brand it is narrowed to, if any. */
  brand: string | null;
  /** What is listed: its items, or that brand's alone. */
  rows: InventoryItem[];
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
    MatTooltipModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PersianCountPipe,
    PersianNumberPipe,
    PbButton,
    PbFilterChips,
    PbIcon,
    PbPage,
    PbPageHeader,
    PbSearchField,
    StockRow,
  ],
  templateUrl: './inventory-list.html',
  styleUrl: './inventory-list.scss',
})
export class InventoryList {
  private readonly inventory = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);
  private readonly errors = inject(ApiErrorTranslator);
  protected readonly auth = inject(AuthService);

  protected readonly filters = FILTERS;
  protected readonly categoryIcons = INVENTORY_CATEGORY_ICONS;
  protected readonly categoryLabel = inventoryCategoryLabel;
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
   * Every active item, whatever the search and filters say: what the tiles
   * count, so they stay the same while one of them is the list on screen.
   * `null` until the first answer.
   */
  protected readonly all = signal<InventoryItem[] | null>(null);
  protected readonly tiles = computed(() => {
    const all = this.all();
    return all ? filterCounts(all) : null;
  });

  /** Each shelf's chosen brand, for this visit. */
  private readonly brands = signal<Partial<Record<InventoryCategory, string>>>({});

  /**
   * Shelf by shelf, in the order the API sends them. Expiring stock is listed
   * soonest first instead, across categories, so it is one run with no heading.
   */
  protected readonly shelves = computed<Shelf[]>(() => {
    const items = this.items();
    const chosen = this.brands();
    const shelf = (category: InventoryCategory | null, items: InventoryItem[]): Shelf => {
      const brands = category ? shelfBrands(items) : [];
      // A brand the shelf no longer offers — a search left too few rows — is not applied.
      const brand = brands.find((b) => category && b === chosen[category]) ?? null;
      return {
        category,
        items,
        flags: shelfFlags(items),
        brands: brands.map((b) => ({ value: b, label: b })),
        brand,
        rows: brand ? items.filter((i) => i.brand === brand) : items,
      };
    };
    if (this.filter() === 'expiry') return items.length ? [shelf(null, items)] : [];
    const runs: { category: InventoryCategory; items: InventoryItem[] }[] = [];
    for (const item of items) {
      const last = runs.at(-1);
      if (last?.category === item.category) last.items.push(item);
      else runs.push({ category: item.category, items: [item] });
    }
    return runs.map((run) => shelf(run.category, run.items));
  });

  /** One category on screen (picked, or all a search left): its brand chips sit over the grid. */
  protected readonly singleShelf = computed(() => {
    const shelves = this.shelves();
    return shelves.length === 1 && shelves[0].category ? shelves[0] : null;
  });

  /**
   * The rail: every category that holds anything, with its count and the
   * worst thing on it — red for stock run out or expired, amber for low or
   * expiring. Counted from every active item, so it holds still while a
   * filter or a search narrows the grid.
   */
  protected readonly categoryStats = computed(() => {
    const all = this.all() ?? [];
    return INVENTORY_CATEGORIES.map((category) => {
      const items = all.filter((i) => i.category === category);
      const flags = shelfFlags(items);
      const alert: 'out' | 'low' | null =
        flags.out || flags.expired ? 'out' : flags.low || flags.expiring ? 'low' : null;
      return { category, count: items.length, alert };
    }).filter((c) => c.count > 0 || c.category === this.category());
  });

  protected readonly panelTitle = computed(() => {
    const category = this.category();
    return category ? inventoryCategoryLabel(category) : 'inventory.allItems';
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
    // The tiles' own request: all the active items, on arrival and after every change.
    toObservable(this.reloadTick)
      .pipe(
        switchMap(() => this.inventory.list({}).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((items) => this.all.set(items));

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

  /** A tile is a filter: tapping the one on screen shows everything again. */
  protected toggleFilter(value: InventoryFilter): void {
    this.filter.update((current) => (current === value ? '' : value));
  }

  /** Tapping the chosen brand again lists the whole shelf. */
  protected setBrand(shelf: Shelf, selected: string[]): void {
    const category = shelf.category;
    if (!category) return;
    this.brands.update((chosen) => ({ ...chosen, [category]: selected[0] }));
  }

  protected setCategory(value: string): void {
    this.category.set(isCategory(value) ? value : '');
  }

  protected toggleArchived(checked: boolean): void {
    this.archivedOnly.set(checked);
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
      .open(InventoryMovementDialog, {
        data,
        autoFocus: 'first-tabbable',
        // An implant's use picks its tooth on the chart, which needs the room.
        width: kind === 'use' && item.category === 'implant' ? '720px' : '480px',
        maxWidth: '92vw',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        // In place, not reloaded: a row that just left the filter stays until
        // the next search, rather than vanishing under the hand that moved it.
        this.replace(saved);
        // The wrong button or a mistyped number is put right from here, while
        // nothing else has touched the item.
        this.toast
          .success(
            this.i18n.instant('inventoryMove.recorded', {
              kind: this.i18n.instant(inventoryMovementLabel(kind)),
              // «Supe Line 4x12», not «Supe Line»: a line's sizes share its name.
              name: [saved.name, saved.spec].filter(Boolean).join(' '),
              count: formatPersianCount(saved.quantity),
              unit: this.i18n.instant(inventoryUnitLabel(saved.unit)),
            }),
            { action: this.i18n.instant('inventory.undo'), duration: 10000 },
          )
          .onAction()
          .subscribe(() => this.undo(saved));
      });
  }

  /** One item as the API now has it, on the list and in the tiles' count. */
  private replace(item: InventoryItem): void {
    const swap = (rows: InventoryItem[]) => rows.map((r) => (r.id === item.id ? item : r));
    this.items.update(swap);
    this.all.update((rows) => (rows ? swap(rows) : rows));
  }

  /** Take back the movement just recorded. */
  private undo(item: InventoryItem): void {
    this.inventory.undo(item.id, item.version).subscribe({
      next: (restored) => {
        this.replace(restored);
        this.toast.success(
          this.i18n.instant('inventory.undone', { count: formatPersianCount(restored.quantity) }),
        );
      },
      error: (error: unknown) => this.writeFailed(error),
    });
  }

  protected history(item: InventoryItem): void {
    const ref = this.dialog.open(InventoryHistoryDialog, {
      data: item,
      width: '720px',
      maxWidth: '92vw',
    });
    // A batch corrected there can move the item's expiry.
    ref.afterClosed().subscribe(() => {
      if (ref.componentInstance.changed) this.retry();
    });
  }

  /** A soft delete: the item reappears under the archive chip, to be restored. */
  protected archive(item: InventoryItem): void {
    const data: ConfirmData = {
      title: this.i18n.instant('inventory.archiveTitle'),
      // Stock still on the shelf leaves the list with it: said, with how much.
      message: item.quantity
        ? this.i18n.instant('inventory.archiveMessageStock', {
            name: item.name,
            count: formatPersianCount(item.quantity),
            unit: this.i18n.instant(inventoryUnitLabel(item.unit)),
          })
        : this.i18n.instant('inventory.archiveMessage', { name: item.name }),
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
          width: '720px',
          maxWidth: '92vw',
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        // Already on the shelves: the delivery goes onto that item.
        if (typeof result === 'object' && 'receiveInto' in result) {
          this.move(result.receiveInto, 'receive');
          return;
        }
        if (result === 'conflict') {
          this.toast.warning(this.i18n.instant('error.inventoryItemModified'));
          this.retry();
          return;
        }
        this.changed(data.item ? 'inventoryForm.saved' : 'inventoryForm.created');
      });
  }

  private changed(message: string): void {
    this.toast.success(this.i18n.instant(message));
    this.retry();
  }

  /** Someone else archived, restored or re-added it first: say so, show the list as it is. */
  private writeFailed(error: unknown): void {
    if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) {
      this.toast.error(this.errors.translate(error));
    }
    this.retry();
  }
}
