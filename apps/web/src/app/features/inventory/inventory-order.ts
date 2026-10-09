import { Component, computed, inject, signal } from '@angular/core';
import {
  type AbstractControl,
  FormControl,
  FormRecord,
  ReactiveFormsModule,
  type ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { format as formatJalali } from 'date-fns-jalali';

import { InventoryService } from '../../core/services/inventory.service';
import type { InventoryItem } from '../../core/models/common.model';
import { EmptyState } from '../../shared/components/empty-state';
import { LoadError } from '../../shared/components/load-error';
import { formatPersianNumber, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { inventoryUnitLabel } from '../../shared/labels';
import { toLatinDigits } from '../../shared/validators';
import { PbButton, PbPage, PbPageHeader, PbTextField } from '../../shared/ui';
import { suggestedOrder } from './stock-sheets';

/** One supplier's part of the list — its brand stands in for who sells it. */
interface OrderGroup {
  brand: string | null;
  items: InventoryItem[];
}

function wholeOrBlank(control: AbstractControl<string>): ValidationErrors | null {
  const raw = toLatinDigits(control.value ?? '').trim();
  return !raw || /^\d{1,6}$/.test(raw) ? null : { pattern: true };
}

/**
 * What to order: every item at or under its reorder level, by brand, each
 * with a quantity to bring it back to twice that level — adjusted here, then
 * copied as text to send the supplier. Nothing is stored: the delivery, when
 * it comes, is recorded as a receipt on each item.
 */
@Component({
  selector: 'pb-inventory-order',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    EmptyState,
    LoadError,
    PersianNumberPipe,
    PbButton,
    PbPage,
    PbPageHeader,
    PbTextField,
  ],
  templateUrl: './inventory-order.html',
  styleUrl: './inventory-order.scss',
})
export class InventoryOrder {
  private readonly inventory = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(TranslateService);

  protected readonly unitLabel = inventoryUnitLabel;
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly items = signal<InventoryItem[]>([]);
  protected readonly amounts = new FormRecord<FormControl<string>>({});

  protected readonly groups = computed<OrderGroup[]>(() => {
    const groups = new Map<string, OrderGroup>();
    for (const item of this.items()) {
      const key = item.brand?.trim().toLowerCase() ?? '';
      const group = groups.get(key) ?? { brand: item.brand, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    // Unbranded last: the general supplier's list after the systems'.
    return [...groups.values()].sort((a, b) => (a.brand ? 0 : 1) - (b.brand ? 0 : 1));
  });

  constructor() {
    this.load();
  }

  protected back(): void {
    void this.router.navigate(['/inventory']);
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.inventory.list({ filter: 'reorder' }).subscribe({
      next: (items) => {
        for (const id of Object.keys(this.amounts.controls)) this.amounts.removeControl(id);
        for (const item of items) {
          this.amounts.addControl(
            item.id,
            new FormControl(String(suggestedOrder(item)), {
              nonNullable: true,
              validators: wholeOrBlank,
            }),
          );
        }
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  protected amount(id: string): FormControl<string> {
    return this.amounts.controls[id];
  }

  /** The list as a message for the supplier: brand by brand, one line an item. */
  protected async copy(): Promise<void> {
    const lines = [
      this.i18n.instant('inventoryOrder.textTitle', {
        date: formatPersianNumber(formatJalali(new Date(), 'yyyy/MM/dd')),
      }),
    ];
    for (const group of this.groups()) {
      const rows = group.items.flatMap((item) => {
        const raw = toLatinDigits(this.amount(item.id).value).trim();
        if (!/^\d+$/.test(raw) || Number(raw) === 0) return [];
        return [
          this.i18n.instant('inventoryOrder.textLine', {
            item: [item.name, item.spec].filter(Boolean).join(' '),
            count: formatPersianNumber(raw),
            unit: this.i18n.instant(inventoryUnitLabel(item.unit)),
          }),
        ];
      });
      if (!rows.length) continue;
      lines.push('', group.brand ?? this.i18n.instant('inventoryOrder.noBrand'), ...rows);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.snackBar.open(
        this.i18n.instant('inventoryOrder.copied'),
        this.i18n.instant('action.dismiss'),
      );
    } catch {
      this.snackBar.open(
        this.i18n.instant('inventoryOrder.copyFailed'),
        this.i18n.instant('action.dismiss'),
        { duration: 6000 },
      );
    }
  }
}
