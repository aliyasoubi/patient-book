import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { InventoryService } from '../../core/services/inventory.service';
import type { InventoryItem, InventoryItemDetail } from '../../core/models/common.model';
import { rialInput, rialValid, rialValue } from '../../shared/rial';
import { PbBanner, PbButton, PbTextField, type TextFieldOption } from '../../shared/ui';
import { showOnFields } from '../inventory/inventory-errors';
import { foldKey } from './tariff-sections';

export interface TariffProductDialogData {
  /** The item whose price is being changed; absent when adding one to the list. */
  item?: InventoryItem;
  /** The stock's items not yet sold to patients, to pick one from. */
  candidates?: readonly InventoryItem[];
}

/** The item as saved, someone else's change in between, or a request to stop selling it. */
export type TariffProductDialogResult = InventoryItemDetail | 'conflict' | 'remove' | undefined;

/** The fewest suggestions that still find an item in a few hundred. */
const MAX_SUGGESTIONS = 8;

const describe = (i: InventoryItem): string => [i.brand, i.spec].filter(Boolean).join(' · ');

/**
 * What an item sold to patients goes for — written on the item itself, the
 * price a sale at the desk starts from, so the list and the stock never
 * disagree. Adding one picks it from the stock and marks it sold to patients:
 * its use then asks who bought it.
 */
@Component({
  selector: 'pb-tariff-product-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbBanner, PbButton, PbTextField],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>
        {{ (item ? 'tariffProduct.editTitle' : 'tariffProduct.addTitle') | translate }}
      </h2>
      <mat-dialog-content class="form">
        @if (formError(); as message) {
          <pb-banner tone="error" size="compact" icon="error" role="alert">{{ message }}</pb-banner>
        }
        @if (item) {
          <div class="product">
            <strong dir="auto">{{ item.name }}</strong>
            @if (describe(item); as detail) {
              <span dir="auto">{{ detail }}</span>
            }
          </div>
        } @else {
          <pb-text-field
            [control]="form.controls.product"
            [label]="'tariffProduct.product' | translate"
            [hint]="'tariffProduct.productHint' | translate"
            [errorMessages]="{ pick: ('tariffProduct.pickOne' | translate) }"
            [options]="productOptions()"
            (optionSelected)="pick($event)"
          />
        }
        <pb-text-field
          [control]="form.controls.price"
          [label]="'tariffProduct.price' | translate"
          [hint]="'tariffProduct.priceHint' | translate"
          inputmode="numeric"
          [grouped]="true"
          [ltr]="true"
        />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (item) {
          <pb-button
            class="remove"
            variant="text"
            tone="danger"
            icon="remove_shopping_cart"
            type="button"
            [disabled]="saving()"
            (click)="ref.close('remove')"
          >
            {{ 'tariffProduct.remove' | translate }}
          </pb-button>
        }
        <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
          {{ 'action.cancel' | translate }}
        </pb-button>
        <pb-button
          variant="text"
          type="submit"
          icon="save"
          [loading]="saving()"
          [loadingText]="'common.saving' | translate"
        >
          {{ 'tariffProduct.save' | translate }}
        </pb-button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-3);
    }
    .product {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-block-end: var(--pb-space-2);

      strong {
        font: var(--mat-sys-title-medium);
      }

      span {
        font: var(--mat-sys-body-medium);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .remove {
      margin-inline-end: auto;
    }
  `,
})
export class TariffProductDialog {
  protected readonly ref =
    inject<MatDialogRef<TariffProductDialog, TariffProductDialogResult>>(MatDialogRef);
  private readonly data = inject<TariffProductDialogData>(MAT_DIALOG_DATA);
  private readonly inventory = inject(InventoryService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly fb = inject(FormBuilder);

  protected readonly item = this.data.item ?? null;
  protected readonly describe = describe;
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** The item picked from the suggestions, while the field still names it. */
  private readonly picked = signal<InventoryItem | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    product: [''],
    price: [rialInput(this.item?.salePrice), [Validators.required, rialValid]],
  });

  private readonly typed = toSignal(this.form.controls.product.valueChanges, {
    initialValue: '',
  });

  /** «مسواک (Oral-B · نرم)»: the stock's items matching every word typed. */
  protected readonly productOptions = computed<TextFieldOption[]>(() => {
    const words = foldKey(this.typed()).split(' ').filter(Boolean);
    if (!words.length) return [];
    return (this.data.candidates ?? [])
      .filter((i) => {
        const text = foldKey([i.name, i.brand, i.spec].filter(Boolean).join(' '));
        return words.every((w) => text.includes(w));
      })
      .slice(0, MAX_SUGGESTIONS)
      .map((i) => ({ value: i.name, label: i.name, id: i.id, meta: describe(i) || undefined }));
  });

  constructor() {
    // Typing on after a pick names something else: the pick no longer holds.
    this.form.controls.product.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (this.picked() && value !== this.picked()?.name) this.picked.set(null);
    });
  }

  protected pick(option: TextFieldOption): void {
    const item = this.data.candidates?.find((i) => i.id === option.id) ?? null;
    this.picked.set(item);
    // Sold before and taken off the list: its last price is a fair start.
    if (item?.salePrice != null && !this.form.controls.price.value) {
      this.form.controls.price.setValue(rialInput(item.salePrice));
    }
  }

  protected submit(): void {
    if (this.saving()) return;
    const target = this.item ?? this.picked();
    if (!target) this.form.controls.product.setErrors({ pick: true });
    if (this.form.invalid || !target) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.inventory
      .update(target.id, {
        soldToPatients: true,
        salePrice: rialValue(this.form.controls.price.value),
        expectedVersion: target.version,
      })
      .subscribe({
        next: (saved) => this.ref.close(saved),
        error: (error: unknown) => {
          this.saving.set(false);
          // Moved or edited since the list loaded: it reloads and says so.
          if (
            error instanceof HttpErrorResponse &&
            (error.error as { code?: string } | null)?.code === 'ERR_INVENTORY_ITEM_MODIFIED'
          ) {
            this.ref.close('conflict');
            return;
          }
          this.formError.set(
            showOnFields(error, this.errors, { salePrice: this.form.controls.price }),
          );
        },
      });
  }
}
