import { HttpErrorResponse } from '@angular/common/http';
import { Component, Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import {
  RegistryCaseInput,
  RegistryKind,
  RegistryService,
} from '../../core/services/registry.service';
import { PatientsService } from '../../features/patients/data/patients.service';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import { CASE_STATUSES, caseStatusLabel } from '../labels';
import { digitString, identifierValue, iranianMobile, toLatinDigits } from '../validators';
import { PbButton, PbSelectField, PbTextareaField, PbTextField } from '../ui';
import type { SelectOption, TextFieldOption } from '../ui';
import type { RegistryCase } from '../../core/models/common.model';
import type { PatientSuggestion } from '../../features/patients/data/patient.model';

/** The patient a case is, or is about to be, linked to. */
interface LinkedPatient {
  id: string;
  fileNo: string;
  fullName: string;
}

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

const MIN_PATIENT_QUERY = 2;

/**
 * Creates or corrects an ortho or implant پرونده.
 *
 * Both registers share one DTO and one pair of endpoints (see
 * {@link RegistryService}), so one dialog serves both rather than two nearly
 * identical forms. Opened from a patient's page it creates a case already
 * linked to that patient; opened from a register row it edits that row —
 * number, name, phones, status, notes and, since imported rows are often
 * unlinked or linked to the wrong file, the patient link itself.
 */
@Component({
  selector: 'pb-registry-case-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    PbTextField,
    PbTextareaField,
    PbSelectField,
    PbButton,
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
        <!-- The link to the main book. Typing searches; picking links; the
             chip's cross unlinks. Text left in the box without a pick changes
             nothing, so a half-typed search cannot silently drop a link. -->
        <pb-text-field
          [control]="form.controls.patientSearch"
          [label]="'registryForm.patientLink' | translate"
          [hint]="linkHint()"
          prefixIcon="person_search"
          [options]="patientOptions()"
          (optionSelected)="onPatientSelected($event)"
        />
        @if (linkedPatient(); as linked) {
          <div class="form__linked">
            <mat-icon aria-hidden="true">link</mat-icon>
            <span
              >{{ linked.fullName }} —
              {{ 'registry.patientFile' | translate: { fileNo: linked.fileNo } }}</span
            >
            <button
              type="button"
              class="form__unlink"
              (click)="unlink()"
              [attr.aria-label]="'registryForm.unlink' | translate"
            >
              <mat-icon aria-hidden="true">close</mat-icon>
            </button>
          </div>
        }
        <pb-select-field
          [control]="form.controls.status"
          [label]="'registryForm.status' | translate"
          [options]="statusOptions"
        />
      }

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
    .form__linked {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: -8px 0 12px;
      padding: 6px 10px;
      border-radius: var(--mat-sys-corner-medium);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-body-medium);

      span {
        flex: 1 1 auto;
        min-width: 0;
      }
    }
    .form__unlink {
      display: inline-flex;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      cursor: pointer;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
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
  private readonly patients = inject(PatientsService);
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

  protected readonly form = this.fb.nonNullable.group({
    registryNo: [
      this.existing?.registryNo ?? '',
      [Validators.required, digitString(1, 24)],
    ],
    recordedName: [
      this.existing?.recordedName ?? (this.data.mode === 'create' ? this.data.patient.name : ''),
      [Validators.required, Validators.maxLength(160)],
    ],
    patientSearch: [''],
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

  /** Type-ahead over the main book; `switchMap` drops a stale response. */
  private readonly patientMatches: Signal<PatientSuggestion[]> = toSignal(
    this.form.controls.patientSearch.valueChanges.pipe(
      debounceTime(250),
      map((v) => v.trim()),
      distinctUntilChanged(),
      switchMap((q) => {
        // Picking an option writes its value — the id — into the box before
        // `optionSelected` swaps in the name. That echo is a pick, not a query.
        const current = this.patientMatches();
        if (current.some((p) => p.id === q)) return of(current);
        if (q.length < MIN_PATIENT_QUERY) return of<PatientSuggestion[]>([]);
        return this.patients.suggest(q).pipe(catchError(() => of<PatientSuggestion[]>([])));
      }),
    ),
    { initialValue: [] as PatientSuggestion[] },
  );

  protected readonly patientOptions = computed<TextFieldOption[]>(() => {
    this.i18n.currentLang();
    return this.patientMatches().map((p) => ({
      value: p.id,
      label: p.fullName || this.i18n.instant('patient.unnamed'),
      meta: this.i18n.instant('registry.patientFile', { fileNo: p.fileNo }),
    }));
  });

  protected readonly linkHint = computed(() => {
    this.i18n.currentLang();
    return this.i18n.instant(
      this.linkedPatient() ? 'registryForm.patientLinkHintLinked' : 'registryForm.patientLinkHint',
    );
  });

  protected onPatientSelected(option: TextFieldOption): void {
    const match = this.patientMatches().find((p) => p.id === option.value);
    if (!match) return;
    this.linkedPatient.set({ id: match.id, fileNo: match.fileNo, fullName: match.fullName });
    // The box shows the choice rather than the id the option carries.
    this.form.controls.patientSearch.setValue(match.fullName, { emitEvent: false });
  }

  protected unlink(): void {
    this.linkedPatient.set(null);
    this.form.controls.patientSearch.setValue('', { emitEvent: false });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const blank = (v: string): string | null => (v.trim() ? v.trim() : null);

    const payload: RegistryCaseInput = {
      registryNo: toLatinDigits(raw.registryNo).trim(),
      recordedName: raw.recordedName.trim(),
      mobile: identifierValue(raw.mobile),
      homePhone: identifierValue(raw.homePhone),
      notes: blank(raw.notes),
    };

    let request;
    if (this.data.mode === 'create') {
      payload.patientId = this.data.patient.id;
      request = this.registry.saveCase(this.data.kind, null, payload);
    } else {
      payload.status = raw.status;
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
