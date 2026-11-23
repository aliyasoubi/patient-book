import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { TariffsService, type TariffInput } from '../../core/services/tariffs.service';
import type { Tariff } from '../../core/models/common.model';
import { rialInput, rialValid, rialValue } from '../../shared/rial';
import {
  PbBanner,
  PbButton,
  PbFieldGrid,
  PbTextField,
  type TextFieldOption,
} from '../../shared/ui';
import { showOnFields } from '../inventory/inventory-errors';
import { foldKey } from './tariff-sections';

export interface TariffDialogData {
  /** The line being changed; absent when adding one. */
  tariff?: Tariff;
  /** The heading a new line starts under: the one the list is narrowed to. */
  category?: string;
  /** The headings already on the list, offered as one is typed. */
  categories: readonly string[];
}

/** The saved line, someone else's edit in between, or a request to remove it. */
export type TariffDialogResult = Tariff | 'conflict' | 'delete' | undefined;

const blank = (raw: string): string | null => raw.trim() || null;

/**
 * Add a service to the price list, or change one. A price is one figure, or
 * the least and the most for work that varies; both in rials, grouped in
 * threes as typed. Saves itself, so a refused save lands on its field.
 */
@Component({
  selector: 'pb-tariff-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    TranslatePipe,
    PbBanner,
    PbButton,
    PbFieldGrid,
    PbTextField,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2 mat-dialog-title>
        {{ (tariff ? 'tariffForm.editTitle' : 'tariffForm.createTitle') | translate }}
      </h2>
      <mat-dialog-content class="form">
        @if (formError(); as message) {
          <pb-banner tone="error" size="compact" icon="error" role="alert">{{ message }}</pb-banner>
        }
        <pb-field-grid>
          <pb-text-field
            class="pb-field-grid__full"
            [control]="form.controls.title"
            [label]="'tariffForm.title' | translate"
            [maxlength]="160"
          />
          <pb-text-field
            class="pb-field-grid__full"
            [control]="form.controls.category"
            [label]="'tariffForm.category' | translate"
            [hint]="'tariffForm.categoryHint' | translate"
            [options]="categoryOptions()"
            [maxlength]="60"
          />
          <pb-text-field
            [control]="form.controls.price"
            [label]="'tariffForm.price' | translate"
            [hint]="'tariffForm.priceHint' | translate"
            inputmode="numeric"
            [grouped]="true"
            [ltr]="true"
          />
          <pb-text-field
            [control]="form.controls.maxPrice"
            [label]="'tariffForm.maxPrice' | translate"
            [hint]="'tariffForm.maxPriceHint' | translate"
            [errorMessages]="{ range: ('tariffForm.rangeInvalid' | translate) }"
            inputmode="numeric"
            [grouped]="true"
            [ltr]="true"
          />
          <pb-text-field
            class="pb-field-grid__full"
            [control]="form.controls.note"
            [label]="'tariffForm.note' | translate"
            [hint]="'tariffForm.noteHint' | translate"
            [maxlength]="300"
          />
        </pb-field-grid>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (tariff) {
          <pb-button
            class="delete"
            variant="text"
            tone="danger"
            icon="delete"
            type="button"
            [disabled]="saving()"
            (click)="ref.close('delete')"
          >
            {{ 'tariffForm.delete' | translate }}
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
          {{ 'tariffForm.save' | translate }}
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
    /* Away from Save, at the start of the row: removing is not the next step. */
    .delete {
      margin-inline-end: auto;
    }
  `,
})
export class TariffDialog {
  protected readonly ref = inject<MatDialogRef<TariffDialog, TariffDialogResult>>(MatDialogRef);
  private readonly data = inject<TariffDialogData>(MAT_DIALOG_DATA);
  private readonly tariffs = inject(TariffsService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly fb = inject(FormBuilder);

  protected readonly tariff = this.data.tariff ?? null;
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: [this.tariff?.title ?? '', [Validators.required, Validators.maxLength(160)]],
    category: [
      this.tariff?.category ?? this.data.category ?? '',
      [Validators.required, Validators.maxLength(60)],
    ],
    price: [rialInput(this.tariff?.price), rialValid],
    maxPrice: [rialInput(this.tariff?.maxPrice), rialValid],
    note: [this.tariff?.note ?? '', Validators.maxLength(300)],
  });

  private readonly categoryTyped = toSignal(this.form.controls.category.valueChanges, {
    initialValue: this.form.controls.category.value,
  });

  /** The headings already used, so a new line joins one rather than starting a near-twin. */
  protected readonly categoryOptions = computed<TextFieldOption[]>(() => {
    const typed = foldKey(this.categoryTyped());
    return this.data.categories
      .filter((c) => !typed || (foldKey(c).includes(typed) && foldKey(c) !== typed))
      .map((c) => ({ value: c, label: c }));
  });

  protected submit(): void {
    if (this.saving()) return;
    const raw = this.form.getRawValue();
    const price = rialValue(raw.price);
    const maxPrice = rialValue(raw.maxPrice);
    // A top needs a bottom under it; the API says the same.
    if (maxPrice !== null && (price === null || maxPrice < price)) {
      this.form.controls.maxPrice.setErrors({ range: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body: TariffInput = {
      title: raw.title.trim(),
      category: raw.category.trim(),
      price,
      maxPrice,
      note: blank(raw.note),
    };
    this.saving.set(true);
    this.formError.set(null);
    const request = this.tariff
      ? this.tariffs.update(this.tariff.id, { ...body, expectedVersion: this.tariff.version })
      : this.tariffs.create(body);
    request.subscribe({
      next: (saved) => this.ref.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        if (
          error instanceof HttpErrorResponse &&
          (error.error as { code?: string } | null)?.code === 'ERR_TARIFF_MODIFIED'
        ) {
          this.ref.close('conflict');
          return;
        }
        this.formError.set(
          showOnFields(error, this.errors, this.form.controls, {
            ERR_TARIFF_TITLE_TAKEN: 'title',
            ERR_TARIFF_RANGE_INVALID: 'maxPrice',
          }),
        );
      },
    });
  }
}
