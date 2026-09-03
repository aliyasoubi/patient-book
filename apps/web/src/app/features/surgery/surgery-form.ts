import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DateAdapter } from '@angular/material/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { RegistryService } from '../../core/services/registry.service';
import { ABUTMENT_TYPES, SURGERY_STATUSES, abutmentLabel, surgeryStatusLabel } from '../../shared/labels';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import {
  PbButton,
  PbDateField,
  PbPageHeader,
  PbSelectField,
  PbSurface,
  PbTextareaField,
  PbTextField,
} from '../../shared/ui';
import type { SelectOption } from '../../shared/ui';

@Component({
  selector: 'pb-surgery-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatProgressBarModule,
    PbTextField,
    PbTextareaField,
    PbSelectField,
    PbDateField,
    PbButton,
    PbSurface,
    PbPageHeader,
    TranslatePipe,
  ],
  templateUrl: './surgery-form.html',
  styleUrl: './surgery-form.scss',
})
export class SurgeryForm {
  private readonly fb = inject(FormBuilder);
  private readonly registry = inject(RegistryService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  protected readonly statusOptions: SelectOption[] = SURGERY_STATUSES.map((s) => ({
    value: s,
    label: surgeryStatusLabel(s),
    translate: true,
  }));
  protected readonly abutmentOptions: SelectOption[] = ABUTMENT_TYPES.map((a) => ({
    value: a,
    label: abutmentLabel(a),
    translate: true,
  }));

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    recordedName: ['', [Validators.required, Validators.maxLength(160)]],
    implantRegistryNo: ['', [Validators.pattern(/^\d{1,24}$/)]],
    surgeryDate: [null as Date | null],
    toothPosition: ['', [Validators.maxLength(200)]],
    abutmentType: ['unknown'],
    prosthesisDue: ['', [Validators.maxLength(60)]],
    status: ['scheduled'],
    notes: ['', [Validators.maxLength(2000)]],
  });

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      // Works regardless of whether a field binds via `formControlName` or the
      // design-system atoms' `[formControl]` — both apply the same NgControl
      // status classes to the control's own host element.
      const firstInvalid = document.querySelector<HTMLElement>(
        '.form input.ng-invalid, .form textarea.ng-invalid, .form mat-select.ng-invalid',
      );
      firstInvalid?.focus();
      firstInvalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const blank = (v: string): string | null => (v.trim() ? v.trim() : null);

    const payload: Record<string, unknown> = {
      recordedName: raw.recordedName.trim(),
      implantRegistryNo: blank(raw.implantRegistryNo),
      toothPosition: blank(raw.toothPosition) ?? '',
      abutmentType: raw.abutmentType,
      prosthesisDue: blank(raw.prosthesisDue),
      status: raw.status,
      notes: blank(raw.notes),
    };
    if (raw.surgeryDate) {
      payload['surgeryDate'] = this.dateAdapter.toIso8601(raw.surgeryDate);
    }

    this.registry.saveSurgery(null, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          this.i18n.instant('surgeryForm.created'),
          this.i18n.instant('action.dismiss'),
        );
        void this.router.navigate(['/surgery']);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.applyServerErrors(error);
      },
    });
  }

  /**
   * Attach a server rejection to the field that caused it.
   *
   * Driven by the API's error codes and `fieldErrors` map, not by matching on
   * message text — the API sends no prose, and matching translated sentences
   * would break the moment either side was reworded.
   */
  private applyServerErrors(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) return;
    const body = error.error as ApiErrorBody | null;

    if (body?.fieldErrors) {
      for (const [path, failures] of Object.entries(body.fieldErrors)) {
        const control = this.form.get(path);
        const failure = failures[0];
        if (!control || !failure) continue;
        control.setErrors({ server: this.errors.field(path, failure.code, failure.params) });
        control.markAsTouched();
      }
    }

    this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
      duration: 6000,
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/surgery']);
  }
}
