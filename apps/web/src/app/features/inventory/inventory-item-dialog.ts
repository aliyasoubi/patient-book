import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import {
  InventoryService,
  type InventoryItemInput,
} from '../../core/services/inventory.service';
import type {
  InventoryCategory,
  InventoryItem,
  InventoryItemDetail,
  InventoryUnit,
} from '../../core/models/common.model';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  inventoryCategoryLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import { toLatinDigits } from '../../shared/validators';
import {
  PbBanner,
  PbButton,
  PbFieldGrid,
  PbSelectField,
  PbTextField,
  PbTextareaField,
  type SelectOption,
} from '../../shared/ui';
import { showOnFields } from './inventory-errors';

export interface InventoryItemDialogData {
  /** The item being corrected; absent when adding one. */
  item?: InventoryItem;
  /** The category a new item starts in — the one the list is showing. */
  category?: InventoryCategory;
}

/** What closing tells the list: the saved item, or that someone else got there first. */
export type InventoryItemDialogResult = InventoryItemDetail | 'conflict' | undefined;

/** Whole counts only, in either digit script. */
function count(control: AbstractControl<string>): ValidationErrors | null {
  const raw = toLatinDigits(control.value ?? '').trim();
  return !raw || /^\d{1,6}$/.test(raw) ? null : { pattern: true };
}

const countValue = (raw: string): number | null => {
  const value = toLatinDigits(raw).trim();
  return value ? Number(value) : null;
};
const blank = (raw: string): string | null => raw.trim() || null;

/**
 * Add an item, or correct one. Saves itself, so a refused save lands on the
 * field it is about. An item's quantity is asked for once, when it is added,
 * as its first count; after that only a movement changes it.
 */
@Component({
  selector: 'pb-inventory-item-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    TranslatePipe,
    PbBanner,
    PbButton,
    PbFieldGrid,
    PbSelectField,
    PbTextField,
    PbTextareaField,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (item ? 'inventoryForm.editTitle' : 'inventoryForm.createTitle') | translate }}
    </h2>
    <mat-dialog-content class="form">
      @if (formError(); as message) {
        <pb-banner tone="error" size="compact" icon="error" role="alert">{{ message }}</pb-banner>
      }
      <pb-field-grid>
        <pb-select-field
          [control]="form.controls.category"
          [options]="categoryOptions"
          [label]="'inventoryForm.category' | translate"
        />
        <pb-text-field
          [control]="form.controls.name"
          [label]="'inventoryForm.name' | translate"
          [hint]="'inventoryForm.nameHint' | translate"
          [maxlength]="120"
        />
        <pb-text-field
          [control]="form.controls.brand"
          [label]="'inventoryForm.brand' | translate"
          [maxlength]="80"
        />
        <pb-text-field
          [control]="form.controls.spec"
          [label]="'inventoryForm.spec' | translate"
          [hint]="'inventoryForm.specHint' | translate"
          [maxlength]="120"
        />
        <pb-select-field
          [control]="form.controls.unit"
          [options]="unitOptions"
          [label]="'inventoryForm.unit' | translate"
        />
        @if (!item) {
          <pb-text-field
            [control]="form.controls.quantity"
            [label]="'inventoryForm.quantity' | translate"
            [hint]="'inventoryForm.quantityHint' | translate"
            inputmode="numeric"
            [ltr]="true"
          />
        }
        <pb-text-field
          [control]="form.controls.minQuantity"
          [label]="'inventoryForm.minQuantity' | translate"
          [hint]="'inventoryForm.minQuantityHint' | translate"
          inputmode="numeric"
          [ltr]="true"
        />
        <pb-text-field
          [control]="form.controls.expiry"
          [label]="'inventoryForm.expiry' | translate"
          [hint]="'inventoryForm.expiryHint' | translate"
          [maxlength]="20"
          [ltr]="true"
        />
        <pb-textarea-field
          class="pb-field-grid__full"
          [control]="form.controls.notes"
          [label]="'inventoryForm.notes' | translate"
          [maxlength]="2000"
          [rows]="2"
        />
      </pb-field-grid>
      @if (item) {
        <p class="form__note">{{ 'inventoryForm.quantityNote' | translate }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button
        variant="text"
        type="button"
        icon="save"
        (click)="submit()"
        [loading]="saving()"
        [loadingText]="'common.saving' | translate"
      >
        {{ 'inventoryForm.save' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-3);
      width: min(680px, 88vw);
    }
    .form__note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class InventoryItemDialog {
  protected readonly ref =
    inject<MatDialogRef<InventoryItemDialog, InventoryItemDialogResult>>(MatDialogRef);
  private readonly data = inject<InventoryItemDialogData>(MAT_DIALOG_DATA);
  private readonly inventory = inject(InventoryService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly fb = inject(FormBuilder);

  protected readonly item = this.data.item ?? null;
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly categoryOptions: SelectOption[] = INVENTORY_CATEGORIES.map((c) => ({
    value: c,
    label: inventoryCategoryLabel(c),
    translate: true,
  }));
  protected readonly unitOptions: SelectOption[] = INVENTORY_UNITS.map((u) => ({
    value: u,
    label: inventoryUnitLabel(u),
    translate: true,
  }));

  protected readonly form = this.fb.nonNullable.group({
    category: [
      (this.item?.category ?? this.data.category ?? 'other') as string,
      Validators.required,
    ],
    name: [this.item?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    brand: [this.item?.brand ?? '', Validators.maxLength(80)],
    spec: [this.item?.spec ?? '', Validators.maxLength(120)],
    unit: [(this.item?.unit ?? 'piece') as string, Validators.required],
    quantity: ['', count],
    minQuantity: [this.item?.minQuantity != null ? String(this.item.minQuantity) : '', count],
    expiry: [this.item?.expiry ?? '', Validators.maxLength(20)],
    notes: [this.item?.notes ?? '', Validators.maxLength(2000)],
  });

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body: InventoryItemInput = {
      category: raw.category as InventoryCategory,
      name: raw.name.trim(),
      brand: blank(raw.brand),
      spec: blank(raw.spec),
      unit: raw.unit as InventoryUnit,
      minQuantity: countValue(raw.minQuantity),
      expiry: blank(toLatinDigits(raw.expiry)),
      notes: blank(raw.notes),
    };
    this.saving.set(true);
    this.formError.set(null);
    const request = this.item
      ? this.inventory.update(this.item.id, { ...body, expectedVersion: this.item.version })
      : this.inventory.create({ ...body, quantity: countValue(raw.quantity) ?? 0 });
    request.subscribe({
      next: (saved) => this.ref.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        // Moved or edited meanwhile: the list reloads and says so.
        if (
          error instanceof HttpErrorResponse &&
          (error.error as { code?: string } | null)?.code === 'ERR_INVENTORY_ITEM_MODIFIED'
        ) {
          this.ref.close('conflict');
          return;
        }
        this.formError.set(
          showOnFields(error, this.errors, this.form.controls, {
            ERR_INVENTORY_ITEM_EXISTS: 'name',
          }),
        );
      },
    });
  }
}
