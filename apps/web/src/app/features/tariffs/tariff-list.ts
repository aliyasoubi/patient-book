import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged, forkJoin, map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService } from '../../core/services/inventory.service';
import { TariffsService } from '../../core/services/tariffs.service';
import type { InventoryItem, Tariff } from '../../core/models/common.model';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';
import {
  PbButton,
  PbFilterChips,
  PbIconButton,
  PbListToolbar,
  PbPage,
  PbPageHeader,
  PbSearchField,
} from '../../shared/ui';
import type { FilterChipOption } from '../../shared/ui';
import { TariffDialog, type TariffDialogData, type TariffDialogResult } from './tariff-dialog';
import {
  TariffProductDialog,
  type TariffProductDialogData,
  type TariffProductDialogResult,
} from './tariff-product-dialog';
import { PRODUCTS, tariffCategories, tariffSections, type TariffRow } from './tariff-sections';

/** How long a line just saved stays marked: long enough to find it again. */
const SAVED_MARK_MS = 1600;

/**
 * The clinic's price list, as the front desk quotes from it: the services
 * under their headings, then what is sold to patients from the stock. Only
 * prices: an item's sale price is set here alone, and every sale of it at
 * the shelf goes at that price.
 */
@Component({
  selector: 'pb-tariff-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PersianCountPipe,
    PbButton,
    PbFilterChips,
    PbIconButton,
    PbListToolbar,
    PbPage,
    PbPageHeader,
    PbSearchField,
  ],
  templateUrl: './tariff-list.html',
  styleUrl: './tariff-list.scss',
})
export class TariffList {
  private readonly tariffs = inject(TariffsService);
  private readonly inventory = inject(InventoryService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(TranslateService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly auth = inject(AuthService);

  protected readonly PRODUCTS = PRODUCTS;

  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(150),
      map((v) => v.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );
  /** The heading the list is narrowed to, or {@link PRODUCTS}; null for all. */
  protected readonly group = signal<string | null>(null);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly services = signal<Tariff[]>([]);
  /** The whole stock: the items sold are listed, the rest offered to add. */
  protected readonly stock = signal<InventoryItem[]>([]);
  /** The line just saved, marked for a moment so the eye finds it. */
  protected readonly savedId = signal<string | null>(null);
  private savedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly categories = computed(() => tariffCategories(this.services()));
  protected readonly sections = computed(() =>
    tariffSections(this.services(), this.stock(), this.query(), this.group()),
  );
  protected readonly groupOptions = computed<FilterChipOption[]>(() => [
    ...this.categories().map((c) => ({ value: c, label: c })),
    { value: PRODUCTS, label: 'tariffs.products', icon: 'shopping_bag', translate: true },
  ]);
  protected readonly narrowed = computed(() => !!this.query() || this.group() !== null);

  constructor() {
    this.load();
  }

  protected canEdit(): boolean {
    return this.auth.can('editTariffs');
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin([this.tariffs.list(), this.inventory.list({})]).subscribe({
      next: ([services, stock]) => {
        this.services.set(services);
        this.stock.set(stock);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  /** Tapping the chosen chip again shows the whole list. */
  protected setGroup(selected: string[]): void {
    this.group.set(selected[0] ?? null);
  }

  protected addService(): void {
    const group = this.group();
    this.openServiceDialog({
      category: group && group !== PRODUCTS ? group : undefined,
      categories: this.categories(),
    });
  }

  protected addProduct(): void {
    this.openProductDialog({ candidates: this.stock().filter((i) => !i.soldToPatients) });
  }

  protected edit(row: TariffRow): void {
    if (row.service) {
      this.openServiceDialog({ tariff: row.service, categories: this.categories() });
    } else if (row.product) {
      this.openProductDialog({ item: row.product });
    }
  }

  private openServiceDialog(data: TariffDialogData): void {
    this.dialog
      .open<TariffDialog, TariffDialogData, TariffDialogResult>(TariffDialog, {
        data,
        autoFocus: 'first-tabbable',
        width: '560px',
        maxWidth: '92vw',
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        if (result === 'conflict') return this.conflict('error.tariffModified');
        if (result === 'delete') return this.confirmDelete(data.tariff!);
        const added = !data.tariff;
        this.services.update((rows) =>
          added ? [...rows, result] : rows.map((r) => (r.id === result.id ? result : r)),
        );
        this.markSaved(result.id);
        this.say(added ? 'tariffs.added' : 'tariffs.saved');
      });
  }

  private openProductDialog(data: TariffProductDialogData): void {
    this.dialog
      .open<TariffProductDialog, TariffProductDialogData, TariffProductDialogResult>(
        TariffProductDialog,
        { data, autoFocus: 'first-tabbable', width: '480px', maxWidth: '92vw' },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        if (result === 'conflict') return this.conflict('error.inventoryItemModified');
        if (result === 'remove') return this.confirmRemove(data.item!);
        this.replaceItem(result);
        this.markSaved(result.id);
        this.say(data.item ? 'tariffs.priceSaved' : 'tariffs.productAdded');
      });
  }

  private confirmDelete(tariff: Tariff): void {
    const data: ConfirmData = {
      title: this.i18n.instant('tariffs.deleteTitle'),
      message: this.i18n.instant('tariffs.deleteMessage', { name: tariff.title }),
      confirmLabel: this.i18n.instant('tariffs.deleteConfirm'),
      tone: 'warn',
    };
    this.confirm(data, () =>
      this.tariffs.remove(tariff.id).subscribe({
        next: () => {
          this.services.update((rows) => rows.filter((r) => r.id !== tariff.id));
          this.say('tariffs.deleted');
        },
        error: (error: unknown) => this.writeFailed(error),
      }),
    );
  }

  /** Off the list, still on the shelf: the item stays in the stock with its price. */
  private confirmRemove(item: InventoryItem): void {
    const data: ConfirmData = {
      title: this.i18n.instant('tariffs.removeTitle'),
      message: this.i18n.instant('tariffs.removeMessage', { name: item.name }),
      confirmLabel: this.i18n.instant('tariffs.removeConfirm'),
      tone: 'warn',
    };
    this.confirm(data, () =>
      this.inventory
        .update(item.id, { soldToPatients: false, expectedVersion: item.version })
        .subscribe({
          next: (saved) => {
            this.replaceItem(saved);
            this.say('tariffs.removed');
          },
          error: (error: unknown) => this.writeFailed(error),
        }),
    );
  }

  private confirm(data: ConfirmData, then: () => void): void {
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) then();
      });
  }

  private replaceItem(item: InventoryItem): void {
    this.stock.update((rows) => rows.map((r) => (r.id === item.id ? item : r)));
  }

  private markSaved(id: string): void {
    clearTimeout(this.savedTimer);
    this.savedId.set(id);
    this.savedTimer = setTimeout(() => this.savedId.set(null), SAVED_MARK_MS);
  }

  private say(message: string): void {
    this.snackBar.open(this.i18n.instant(message), this.i18n.instant('action.dismiss'), {
      duration: 4000,
    });
  }

  /** Someone else changed it first: say so, and show the list as it now is. */
  private conflict(message: string): void {
    this.snackBar.open(this.i18n.instant(message), this.i18n.instant('action.dismiss'), {
      duration: 6000,
    });
    this.load();
  }

  private writeFailed(error: unknown): void {
    this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
      duration: 6000,
    });
    if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) this.load();
  }
}
