import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { InventoryService } from '../../core/services/inventory.service';
import type { InventoryItemDetail, InventoryLot } from '../../core/models/common.model';
import { toLatinDigits } from '../../shared/validators';
import { PbBanner, PbButton, PbTextField } from '../../shared/ui';
import { showOnFields } from './inventory-errors';

export interface InventoryLotDialogData {
  itemId: string;
  lot: InventoryLot;
}

/**
 * Put right what a batch's packs say — a lot number or an expiry typed wrong
 * on delivery. How many are left is not here: that moves by a movement.
 */
@Component({
  selector: 'pb-inventory-lot-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbBanner, PbButton, PbTextField],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>{{ 'inventoryLot.title' | translate }}</h2>
      <mat-dialog-content class="form">
        @if (formError(); as message) {
          <pb-banner tone="error" size="compact" icon="error" role="alert">{{ message }}</pb-banner>
        }
        <pb-text-field
          [control]="form.controls.lotNumber"
          [label]="'inventoryMove.lotNumber' | translate"
          [maxlength]="60"
          [ltr]="true"
        />
        <pb-text-field
          [control]="form.controls.expiry"
          [label]="'inventoryForm.expiry' | translate"
          [hint]="'inventoryForm.expiryHint' | translate"
          [maxlength]="20"
          [ltr]="true"
        />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
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
          {{ 'inventoryForm.save' | translate }}
        </pb-button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      width: min(360px, 80vw);
    }
  `,
})
export class InventoryLotDialog {
  protected readonly ref =
    inject<MatDialogRef<InventoryLotDialog, InventoryItemDetail | undefined>>(MatDialogRef);
  private readonly data = inject<InventoryLotDialogData>(MAT_DIALOG_DATA);
  private readonly inventory = inject(InventoryService);
  private readonly errors = inject(ApiErrorTranslator);

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    lotNumber: [this.data.lot.lotNumber ?? '', Validators.maxLength(60)],
    expiry: [this.data.lot.expiry ?? '', Validators.maxLength(20)],
  });

  protected submit(): void {
    if (this.saving() || this.form.invalid) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.inventory
      .updateLot(this.data.itemId, this.data.lot.id, {
        lotNumber: raw.lotNumber.trim() || null,
        expiry: toLatinDigits(raw.expiry).trim() || null,
      })
      .subscribe({
        next: (saved) => this.ref.close(saved),
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(
            showOnFields(error, this.errors, this.form.controls, {
              ERR_INVENTORY_LOT_EXISTS: 'lotNumber',
            }),
          );
        },
      });
  }
}
