import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { RegistryService } from '../../core/services/registry.service';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import { iranianMobile } from '../validators';
import { PbButton, PbTextareaField, PbTextField } from '../ui';
import type { RegistryCase } from '../../core/models/common.model';

export interface RegistryCaseDialogData {
  kind: 'ortho' | 'implant';
  patientId: string;
  patientName: string;
  patientMobile: string | null;
  patientHomePhone: string | null;
}

/**
 * Opens a new ortho or implant پرونده for the patient already on screen.
 *
 * Both registers share one DTO and one create endpoint (see
 * {@link RegistryService}), so one dialog serves both rather than two nearly
 * identical forms. `patientId` is fixed by the caller — this dialog only ever
 * creates a case already linked to the patient it was opened from.
 */
@Component({
  selector: 'pb-registry-case-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatProgressBarModule,
    PbTextField,
    PbTextareaField,
    PbButton,
    TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.kind === 'ortho' ? 'registryForm.newOrtho' : 'registryForm.newImplant') | translate }}
    </h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <mat-dialog-content class="form">
      <pb-text-field
        [control]="form.controls.registryNo"
        [label]="'registryForm.registryNo' | translate"
        [ltr]="true"
        inputmode="numeric"
        [maxlength]="24"
      />
      <pb-text-field
        [control]="form.controls.recordedName"
        [label]="'registryForm.recordedName' | translate"
        [maxlength]="160"
      />
      <pb-text-field
        [control]="form.controls.mobile"
        [label]="'registryForm.mobile' | translate"
        type="tel"
        [ltr]="true"
        inputmode="tel"
      />
      <pb-text-field
        [control]="form.controls.homePhone"
        [label]="'registryForm.homePhone' | translate"
        type="tel"
        [ltr]="true"
        inputmode="tel"
      />
      <pb-textarea-field
        [control]="form.controls.notes"
        [label]="'registryForm.notes' | translate"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button
        variant="flat"
        type="button"
        icon="save"
        (click)="submit()"
        [loading]="saving()"
        [loadingText]="'common.saving' | translate"
      >
        {{ 'registryForm.create' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(420px, 80vw);
    }
  `,
})
export class RegistryCaseDialog {
  protected readonly ref = inject<MatDialogRef<RegistryCaseDialog, RegistryCase | undefined>>(
    MatDialogRef,
  );
  protected readonly data = inject<RegistryCaseDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly registry = inject(RegistryService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    registryNo: ['', [Validators.required, Validators.pattern(/^\d{1,24}$/)]],
    recordedName: [this.data.patientName, [Validators.required, Validators.maxLength(160)]],
    mobile: [this.data.patientMobile ?? '', [iranianMobile]],
    homePhone: [this.data.patientHomePhone ?? '', [Validators.pattern(/^\d{4,15}$/)]],
    notes: [''],
  });

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const blank = (v: string): string | null => (v.trim() ? v.trim() : null);

    const payload: Partial<RegistryCase> = {
      registryNo: raw.registryNo.trim(),
      recordedName: raw.recordedName.trim(),
      patientId: this.data.patientId,
      mobile: blank(raw.mobile),
      homePhone: blank(raw.homePhone),
      notes: blank(raw.notes),
    };

    const request =
      this.data.kind === 'ortho'
        ? this.registry.saveOrtho(null, payload)
        : this.registry.saveImplant(null, payload);

    request.subscribe({
      next: (created) => {
        this.saving.set(false);
        this.ref.close(created);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.applyServerErrors(error);
      },
    });
  }

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

    const fieldForCode: Partial<Record<string, keyof typeof this.form.controls>> = {
      ERR_REGISTRY_NUMBER_TAKEN: 'registryNo',
      ERR_MOBILE_INVALID: 'mobile',
      ERR_PHONE_INVALID: 'homePhone',
    };
    const target = body?.code ? fieldForCode[body.code] : undefined;
    const message = this.errors.translate(error);

    if (target) {
      this.form.controls[target].setErrors({ server: message });
      this.form.controls[target].markAsTouched();
    }
    this.snackBar.open(message, this.i18n.instant('action.dismiss'), { duration: 6000 });
  }
}
