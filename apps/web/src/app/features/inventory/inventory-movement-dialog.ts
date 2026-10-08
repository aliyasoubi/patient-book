import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { InventoryService } from '../../core/services/inventory.service';
import type {
  InventoryItem,
  InventoryItemDetail,
  InventoryMovementKind,
} from '../../core/models/common.model';
import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { inventoryUnitLabel } from '../../shared/labels';
import { toLatinDigits } from '../../shared/validators';
import { PbBanner, PbButton, PbTextField } from '../../shared/ui';
import { showOnFields } from './inventory-errors';

export interface InventoryMovementDialogData {
  item: InventoryItem;
  kind: InventoryMovementKind;
}

/** Literal keys per kind, so the i18n check sees every one. */
const COPY: Record<
  InventoryMovementKind,
  { title: string; quantity: string; note: string; confirm: string; icon: string }
> = {
  receive: {
    title: 'inventoryMove.receiveTitle',
    quantity: 'inventoryMove.receiveQuantity',
    note: 'inventoryMove.receiveNote',
    confirm: 'inventoryMove.receiveConfirm',
    icon: 'move_to_inbox',
  },
  use: {
    title: 'inventoryMove.useTitle',
    quantity: 'inventoryMove.useQuantity',
    note: 'inventoryMove.useNote',
    confirm: 'inventoryMove.useConfirm',
    icon: 'outbox',
  },
  discard: {
    title: 'inventoryMove.discardTitle',
    quantity: 'inventoryMove.discardQuantity',
    note: 'inventoryMove.discardNote',
    confirm: 'inventoryMove.discardConfirm',
    icon: 'delete_sweep',
  },
  count: {
    title: 'inventoryMove.countTitle',
    quantity: 'inventoryMove.countQuantity',
    note: 'inventoryMove.countNote',
    confirm: 'inventoryMove.countConfirm',
    icon: 'fact_check',
  },
};

/**
 * One delivery, use, discard or count, filled in already for the common case
 * — one used, one received, the count as recorded — so Enter alone records
 * it. A delivery or a count may read an expiry off the packs; what is taken out is checked against the shelf here
 * as well as by the API, which has the final word if someone else took the
 * last one meanwhile.
 */
@Component({
  selector: 'pb-inventory-movement-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbBanner, PbButton, PbTextField],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>{{ copy.title | translate }}</h2>
      <mat-dialog-content class="form">
        <p class="form__item">
          <strong dir="auto">{{ itemLabel }}</strong>
          <span>{{
            'inventoryMove.current' | translate: { count: faNum(item.quantity), unit: unit() }
          }}</span>
        </p>
        @if (formError(); as message) {
          <pb-banner tone="error" size="compact" icon="error" role="alert">{{ message }}</pb-banner>
        }
        <pb-text-field
          [control]="form.controls.quantity"
          [label]="copy.quantity | translate"
          [hint]="afterHint()"
          [errorMessages]="quantityErrors()"
          inputmode="numeric"
          [ltr]="true"
        />
        @if (kind === 'receive' || kind === 'count') {
          <pb-text-field
            [control]="form.controls.expiry"
            [label]="'inventoryMove.expiry' | translate"
            [hint]="'inventoryForm.expiryHint' | translate"
            [maxlength]="20"
            [ltr]="true"
          />
        }
        <pb-text-field
          [control]="form.controls.note"
          [label]="'inventoryMove.note' | translate"
          [hint]="copy.note | translate"
          [maxlength]="300"
        />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
          {{ 'action.cancel' | translate }}
        </pb-button>
        <pb-button
          variant="text"
          type="submit"
          [icon]="copy.icon"
          [loading]="saving()"
          [loadingText]="'common.saving' | translate"
        >
          {{ copy.confirm | translate }}
        </pb-button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      width: min(400px, 80vw);
    }
    .form__item {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      margin: 0 0 var(--pb-space-3);
      color: var(--mat-sys-on-surface-variant);

      strong {
        font: var(--mat-sys-title-small);
        color: var(--mat-sys-on-surface);
      }
    }
  `,
})
export class InventoryMovementDialog {
  protected readonly ref =
    inject<MatDialogRef<InventoryMovementDialog, InventoryItemDetail | undefined>>(MatDialogRef);
  private readonly data = inject<InventoryMovementDialogData>(MAT_DIALOG_DATA);
  private readonly inventory = inject(InventoryService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  protected readonly item = this.data.item;
  protected readonly kind = this.data.kind;
  protected readonly copy = COPY[this.kind];
  protected readonly faNum = formatPersianNumber;
  protected readonly itemLabel = [this.item.name, this.item.brand, this.item.spec]
    .filter(Boolean)
    .join(' · ');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /** Out of what is there: more than that cannot leave the shelf. */
  private readonly withinStock = (control: AbstractControl<string>): ValidationErrors | null => {
    const n = Number(toLatinDigits(control.value ?? '').trim());
    const takesOut = this.kind === 'use' || this.kind === 'discard';
    return takesOut && n > this.item.quantity ? { stock: true } : null;
  };

  private readonly quantityValid = (control: AbstractControl<string>): ValidationErrors | null => {
    const raw = toLatinDigits(control.value ?? '').trim();
    if (!/^\d{1,6}$/.test(raw)) return { pattern: true };
    return this.kind !== 'count' && Number(raw) < 1 ? { pattern: true } : null;
  };

  protected readonly form = this.fb.nonNullable.group({
    // A count starts from the record, to be corrected; anything else from one.
    quantity: [
      this.kind === 'count' ? String(this.item.quantity) : '1',
      [Validators.required, this.quantityValid, this.withinStock],
    ],
    expiry: ['', Validators.maxLength(20)],
    note: ['', Validators.maxLength(300)],
  });

  private readonly quantity = toSignal(this.form.controls.quantity.valueChanges, {
    initialValue: this.form.controls.quantity.value,
  });

  protected unit(): string {
    return this.i18n.instant(inventoryUnitLabel(this.item.unit));
  }

  protected readonly quantityErrors = computed(() => ({
    stock: this.i18n.instant('error.inventoryInsufficientStock', {
      available: formatPersianNumber(this.item.quantity),
    }),
  }));

  /** What the shelf will hold once this is saved, so nobody has to add up. */
  protected readonly afterHint = computed(() => {
    const raw = toLatinDigits(this.quantity()).trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    const after =
      this.kind === 'count'
        ? n
        : this.kind === 'receive'
          ? this.item.quantity + n
          : this.item.quantity - n;
    if (after < 0) return null;
    return this.i18n.instant('inventoryMove.after', { count: formatPersianNumber(after) });
  });

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.inventory
      .move(this.item.id, {
        kind: this.kind,
        quantity: Number(toLatinDigits(raw.quantity).trim()),
        expiry: toLatinDigits(raw.expiry).trim() || null,
        note: raw.note.trim() || null,
      })
      .subscribe({
        next: (saved) => this.ref.close(saved),
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(
            showOnFields(error, this.errors, this.form.controls, {
              ERR_INVENTORY_INSUFFICIENT_STOCK: 'quantity',
            }),
          );
        },
      });
  }
}
