import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  RegistryCaseInput,
  RegistryKind,
  RegistryService,
} from '../../core/services/registry.service';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import { CASE_STATUSES, caseStatusLabel } from '../labels';
import { digitString, identifierValue, iranianMobile, toLatinDigits } from '../validators';
import { PbButton, PbSelectField, PbTextareaField, PbTextField } from '../ui';
import type { SelectOption } from '../ui';
import type { RegistryCase } from '../../core/models/common.model';
import { PbPatientLinkField } from './patient-link-field';
import type { LinkedPatient } from './patient-link-field';

export type RegistryCaseDialogData =
  | {
      mode: 'create';
      kind: RegistryKind;
      /** The patient the new case is opened from; the link is fixed. */
      patient: { id: string; name: string; mobile: string | null; homePhone: string | null };
    }
  | {
      mode: 'edit';
      kind: RegistryKind;
      existing: RegistryCase;
    };

/**
 * Creates or corrects an ortho or implant پرونده.
 *
 * Both registers share one DTO and one pair of endpoints (see
 * {@link RegistryService}), so one dialog serves both rather than two nearly
 * identical forms. Opened from a patient's page it creates a case already
 * linked to that patient; opened from a register row it edits that row —
 * number, name, phones, status, notes and, since imported rows are often
 * unlinked or linked to the wrong file, the patient link itself. Both books
 * keep only the number, name and link.
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
    PbSelectField,
    PbButton,
    PbPatientLinkField,
    TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ title | translate }}</h2>
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

      @if (data.mode === 'edit') {
        <pb-patient-link-field
          [label]="'registryForm.patientLink' | translate"
          [(linked)]="linkedPatient"
        />
        @if (showDetails) {
          <pb-select-field
            [control]="form.controls.status"
            [label]="'registryForm.status' | translate"
            [options]="statusOptions"
          />
        }
      }

      @if (showDetails) {
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
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <!-- Text buttons on both sides: M3 dialog actions differ by position,
           not by fill; the filled button belongs to full-screen dialogs. -->
      <pb-button
        variant="text"
        type="button"
        icon="save"
        (click)="submit()"
        [loading]="saving()"
        [loadingText]="'common.saving' | translate"
      >
        {{ (data.mode === 'edit' ? 'registryForm.save' : 'registryForm.create') | translate }}
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

  protected readonly title =
    this.data.mode === 'edit'
      ? this.data.kind === 'ortho'
        ? 'registryForm.editOrtho'
        : 'registryForm.editImplant'
      : this.data.kind === 'ortho'
        ? 'registryForm.newOrtho'
        : 'registryForm.newImplant';

  protected readonly statusOptions: SelectOption[] = CASE_STATUSES.map((status) => ({
    value: status,
    label: caseStatusLabel(status),
    translate: true,
  }));

  private readonly existing = this.data.mode === 'edit' ? this.data.existing : null;

  /** Phones, status and notes; neither the implant nor the ortho book keeps them. */
  protected readonly showDetails: boolean = false;

  protected readonly form = this.fb.nonNullable.group({
    registryNo: [
      this.existing?.registryNo ?? '',
      [Validators.required, digitString(1, 18)],
    ],
    recordedName: [
      this.existing?.recordedName ?? (this.data.mode === 'create' ? this.data.patient.name : ''),
      [Validators.required, Validators.maxLength(160)],
    ],
    status: [this.existing?.status ?? ('active' as RegistryCase['status'])],
    mobile: [
      this.existing?.mobile ?? (this.data.mode === 'create' ? this.data.patient.mobile : null) ?? '',
      [iranianMobile],
    ],
    homePhone: [
      this.existing?.homePhone ??
        (this.data.mode === 'create' ? this.data.patient.homePhone : null) ??
        '',
      [digitString(4, 15)],
    ],
    notes: [this.existing?.notes ?? ''],
  });

  constructor() {
    // Hidden fields must not block a save with a value the user cannot see,
    // such as an old malformed phone number prefilled from the patient.
    if (!this.showDetails) {
      for (const name of ['status', 'mobile', 'homePhone', 'notes'] as const) {
        this.form.controls[name].disable();
      }
    }
  }

  /** The link as it will be saved; starts as whatever the row already holds. */
  protected readonly linkedPatient = signal<LinkedPatient | null>(
    this.existing?.patient
      ? {
          id: this.existing.patient.id,
          fileNo: this.existing.patient.fileNo,
          fullName: `${this.existing.patient.firstName} ${this.existing.patient.lastName}`.trim(),
        }
      : null,
  );

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const blank = (v: string): string | null => (v.trim() ? v.trim() : null);

    // Fields the form does not show are left out, so what is stored stays.
    const payload: RegistryCaseInput = {
      registryNo: toLatinDigits(raw.registryNo).trim(),
      recordedName: raw.recordedName.trim(),
      ...(this.showDetails && {
        mobile: identifierValue(raw.mobile),
        homePhone: identifierValue(raw.homePhone),
        notes: blank(raw.notes),
      }),
    };

    let request;
    if (this.data.mode === 'create') {
      payload.patientId = this.data.patient.id;
      request = this.registry.saveCase(this.data.kind, null, payload);
    } else {
      if (this.showDetails) payload.status = raw.status;
      // Only a changed link is sent: the API treats any `patientId` it
      // receives as a deliberate, manual decision about the match.
      const linkedId = this.linkedPatient()?.id ?? null;
      if (linkedId !== this.data.existing.patientId) payload.patientId = linkedId;
      request = this.registry.saveCase(this.data.kind, this.data.existing.id, payload);
    }

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.ref.close(saved);
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
