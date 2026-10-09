import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
  InventoryLot,
  InventoryMovementKind,
} from '../../core/models/common.model';
import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { inventoryUnitLabel, TRACEABLE_CATEGORIES } from '../../shared/labels';
import { toLatinDigits } from '../../shared/validators';
import { expiryEnd, isPast } from './stock-sheets';

import { PbBanner, PbButton, PbSelectField, PbTextField, type SelectOption } from '../../shared/ui';
import { showOnFields } from './inventory-errors';

/** An expiry the API will read — said on the field, before it is sent. */
const readableExpiry = (control: AbstractControl<string>): ValidationErrors | null =>
  !control.value?.trim() || expiryEnd(control.value) ? null : { expiry: true };

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
 * it. A delivery reads its lot and expiry off the packs. A use or a discard
 * comes out of the first-expiring batch unless another is picked; an implant
 * or a graft names its batch and the patient it went into, which is what a
 * recall is traced through. What is taken out is checked against the shelf
 * here as well as by the API, which has the final word if someone else took
 * the last one meanwhile.
 */
@Component({
  selector: 'pb-inventory-movement-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    TranslatePipe,
    PbBanner,
    PbButton,
    PbSelectField,
    PbTextField,
  ],
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
        <!-- Not refused, but rarely meant: said before it is saved. -->
        @if (expiredBatch()) {
          <pb-banner tone="warning" size="compact" icon="event_busy" role="note">
            {{ 'inventoryMove.expiredBatch' | translate }}
          </pb-banner>
        }
        @if (pastExpiry()) {
          <pb-banner tone="warning" size="compact" icon="event_busy" role="note">
            {{ 'inventoryMove.pastExpiry' | translate }}
          </pb-banner>
        }
        <!-- Which batch, when there is a choice to make. -->
        @if (takesOut && lotOptions().length > 1) {
          <pb-select-field
            [control]="form.controls.lotId"
            [options]="lotOptions()"
            [label]="'inventoryMove.lot' | translate"
          />
        }
        <pb-text-field
          [control]="form.controls.quantity"
          [label]="copy.quantity | translate"
          [hint]="afterHint()"
          [errorMessages]="quantityErrors()"
          inputmode="numeric"
          [ltr]="true"
        />
        @if (kind === 'receive') {
          <pb-text-field
            [control]="form.controls.lotNumber"
            [label]="'inventoryMove.lotNumber' | translate"
            [errorMessages]="traceableErrors"
            [hint]="
              (traceable ? 'inventoryMove.lotNumberTraced' : 'inventoryMove.lotNumberHint')
                | translate
            "
            [maxlength]="60"
            [ltr]="true"
          />
          <pb-text-field
            [control]="form.controls.expiry"
            [label]="'inventoryMove.expiry' | translate"
            [hint]="'inventoryForm.expiryHint' | translate"
            [errorMessages]="traceableErrors"
            [maxlength]="20"
            [ltr]="true"
          />
        }
        @if (kind === 'use' && traceable) {
          <pb-text-field
            [control]="form.controls.patientFileNo"
            [label]="'inventoryMove.patientFileNo' | translate"
            [hint]="'inventoryMove.patientFileNoHint' | translate"
            inputmode="numeric"
            [maxlength]="18"
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
      width: min(440px, 80vw);
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

  private readonly destroyRef = inject(DestroyRef);

  protected readonly item = this.data.item;
  protected readonly kind = this.data.kind;
  protected readonly copy = COPY[this.kind];
  protected readonly takesOut = this.kind === 'use' || this.kind === 'discard';
  protected readonly traceable = TRACEABLE_CATEGORIES.includes(this.item.category);
  private readonly mustTrace = this.kind === 'receive' && this.traceable;
  protected readonly faNum = formatPersianNumber;
  protected readonly itemLabel = [this.item.name, this.item.brand, this.item.spec]
    .filter(Boolean)
    .join(' · ');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /** The batches on the shelf, first-expiring first — read once the dialog opens. */
  protected readonly lots = signal<InventoryLot[]>([]);
  /** What the batch picked, or the shelf, holds: more cannot leave it. */
  private available = this.item.quantity;

  private readonly withinStock = (control: AbstractControl<string>): ValidationErrors | null => {
    const n = Number(toLatinDigits(control.value ?? '').trim());
    return this.takesOut && n > this.available ? { stock: true } : null;
  };

  private readonly quantityValid = (control: AbstractControl<string>): ValidationErrors | null => {
    const raw = toLatinDigits(control.value ?? '').trim();
    if (!/^\d{1,6}$/.test(raw)) return { pattern: true };
    return this.kind !== 'count' && Number(raw) < 1 ? { pattern: true } : null;
  };

  protected readonly form = this.fb.nonNullable.group({
    // An empty choice is first-expiring first, across batches.
    lotId: [''],
    // A count starts from the record, to be corrected; anything else from one.
    quantity: [
      this.kind === 'count' ? String(this.item.quantity) : '1',
      [Validators.required, this.quantityValid, this.withinStock],
    ],
    // An implant's or a graft's lot and expiry are what a recall traces.
    lotNumber: [
      '',
      this.mustTrace ? [Validators.required, Validators.maxLength(60)] : Validators.maxLength(60),
    ],
    expiry: [
      '',
      this.mustTrace
        ? [Validators.required, Validators.maxLength(20), readableExpiry]
        : [Validators.maxLength(20), readableExpiry],
    ],
    patientFileNo: ['', Validators.pattern(/^[0-9۰-۹٠-٩]{1,18}$/)],
    note: ['', Validators.maxLength(300)],
  });

  private readonly quantity = toSignal(this.form.controls.quantity.valueChanges, {
    initialValue: this.form.controls.quantity.value,
  });
  private readonly expiryTyped = toSignal(this.form.controls.expiry.valueChanges, {
    initialValue: '',
  });
  private readonly lotPicked = toSignal(this.form.controls.lotId.valueChanges, {
    initialValue: '',
  });

  protected readonly traceableErrors = {
    required: this.i18n.instant('inventoryMove.lotRequired'),
    expiry: this.i18n.instant('validation.expiry'),
  };

  /** A delivery whose packs say they have already expired: almost always a typo. */
  protected readonly pastExpiry = computed(
    () => this.kind === 'receive' && isPast(this.expiryTyped()),
  );

  /** A use out of a batch past its date — the one picked, or the first to go out. */
  protected readonly expiredBatch = computed(() => {
    if (this.kind !== 'use') return false;
    const lots = this.lots();
    const lot = this.lotPicked() ? lots.find((l) => l.id === this.lotPicked()) : lots[0];
    return lot?.expiryState === 'expired';
  });

  /** «A-100 · انقضا ۲۰۲۷/۰۱ · ۵ مانده», first-expiring first, after «first-expiring». */
  protected readonly lotOptions = computed<SelectOption[]>(() => {
    const lots = this.lots();
    if (lots.length < 2) return [];
    return [
      { value: '', label: 'inventoryMove.lotAuto', translate: true },
      ...lots.map((lot) => ({ value: lot.id, label: this.lotLabel(lot) })),
    ];
  });

  constructor() {
    if (!this.takesOut) return;
    this.form.controls.lotId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.recheckStock());
    this.inventory.get(this.item.id).subscribe({
      next: (detail) => {
        this.lots.set(detail.lots);
        // An implant or a graft names its batch — the first to expire, unless
        // the box opened was another.
        if (this.traceable && detail.lots.length > 1) {
          this.form.controls.lotId.setValue(detail.lots[0].id);
        }
        this.recheckStock();
      },
      // Without the batches the use still goes first-expiring first.
      error: () => this.lots.set([]),
    });
  }

  protected unit(): string {
    return this.i18n.instant(inventoryUnitLabel(this.item.unit));
  }

  protected readonly quantityErrors = computed(() => {
    this.quantity();
    return {
      stock: this.i18n.instant('error.inventoryInsufficientStock', {
        available: formatPersianNumber(this.available),
      }),
    };
  });

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

  private recheckStock(): void {
    const lotId = this.form.controls.lotId.value;
    this.available = lotId
      ? (this.lots().find((l) => l.id === lotId)?.quantity ?? 0)
      : this.item.quantity;
    this.form.controls.quantity.updateValueAndValidity();
  }

  private lotLabel(lot: InventoryLot): string {
    return [
      lot.lotNumber ?? this.i18n.instant('inventoryMove.noLotNumber'),
      lot.expiry
        ? this.i18n.instant('inventory.expiresOn', { date: formatPersianNumber(lot.expiry) })
        : null,
      this.i18n.instant('inventoryMove.lotLeft', { count: formatPersianNumber(lot.quantity) }),
    ]
      .filter(Boolean)
      .join(' · ');
  }

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
        ...(this.kind === 'receive'
          ? {
              lotNumber: raw.lotNumber.trim() || null,
              expiry: toLatinDigits(raw.expiry).trim() || null,
            }
          : {}),
        ...(this.takesOut ? { lotId: raw.lotId || null } : {}),
        ...(this.kind === 'use' && this.traceable
          ? { patientFileNo: toLatinDigits(raw.patientFileNo).trim() || null }
          : {}),
        note: raw.note.trim() || null,
      })
      .subscribe({
        next: (saved) => this.ref.close(saved),
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(
            showOnFields(error, this.errors, this.form.controls, {
              ERR_INVENTORY_INSUFFICIENT_STOCK: 'quantity',
              ERR_PATIENT_NOT_FOUND: 'patientFileNo',
            }),
          );
        },
      });
  }
}
