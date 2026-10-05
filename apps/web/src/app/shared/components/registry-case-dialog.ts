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
import { digitString, toLatinDigits } from '../validators';
import { adoptUntouched, changedFields, type FieldReader } from '../form-sync';
import { PbButton, PbIconButton, PbTextField } from '../ui';
import type { TextFieldOption } from '../ui';
import type { RegistryCase } from '../../core/models/common.model';
import type { PatientSuggestion } from '../../features/patients/data/patient.model';

/** The patient a case is, or is about to be, linked to. */
/**
 * Label keys of the fields this dialog shows that differ between two copies
 * of a case — what a conflict message lists so the user knows what changed.
 */
export function changedCaseFields(before: RegistryCase, after: RegistryCase): string[] {
  const fields: FieldReader<RegistryCase>[] = [
    ['registryForm.registryNo', (c) => c.registryNo],
    ['registryForm.recordedName', (c) => c.recordedName],
    ['registryForm.patientLink', (c) => c.patientId],
  ];
  return changedFields(before, after, fields);
}

/** The link as the dialog shows it, from a case's loaded patient. */
function linkOf(c: RegistryCase | null): LinkedPatient | null {
  return c?.patient
    ? {
        id: c.patient.id,
        fileNo: c.patient.fileNo,
        fullName: `${c.patient.firstName} ${c.patient.lastName}`.trim(),
      }
    : null;
}

interface LinkedPatient {
  id: string;
  fileNo: string;
  fullName: string;
}

export interface RegistryCaseDialogData {
  mode: 'edit';
  kind: RegistryKind;
  existing: RegistryCase;
}

const MIN_PATIENT_QUERY = 2;

/**
 * Corrects an ortho or implant پرونده.
 *
 * Both registers share one DTO and one pair of endpoints (see
 * {@link RegistryService}), so one dialog serves both rather than two nearly
 * identical forms. It edits the number, the name and, since imported rows are
 * often unlinked or linked to the wrong file, the patient link itself. New
 * cases need no dialog: the patient page opens them with the book's next
 * number and the patient's name. Neither book keeps phones, a status or
 * notes, so the dialog never sends them and whatever is stored stays.
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
    PbButton,
    PbIconButton,
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
          <pb-icon-button
            icon="close"
            size="compact"
            (click)="unlink()"
            [ariaLabel]="'registryForm.unlink' | translate"
          />
        </div>
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
        {{ 'registryForm.save' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      min-width: min(420px, 80vw);
    }
    .form__linked {
      display: flex;
      align-items: center;
      gap: var(--pb-space-2);
      margin: calc(-1 * var(--pb-space-2)) 0 var(--pb-space-3);
      padding: var(--pb-space-2) var(--pb-space-3);
      border-radius: var(--mat-sys-corner-medium);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-body-medium);
      --mat-icon-button-icon-color: var(--mat-sys-on-secondary-container);

      span {
        flex: 1 1 auto;
        min-width: 0;
      }
    }
  `,
})
export class RegistryCaseDialog {
  protected readonly ref =
    inject<MatDialogRef<RegistryCaseDialog, RegistryCase | undefined>>(MatDialogRef);
  protected readonly data = inject<RegistryCaseDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly registry = inject(RegistryService);
  private readonly patients = inject(PatientsService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly saving = signal(false);

  protected readonly title =
    this.data.kind === 'ortho' ? 'registryForm.editOrtho' : 'registryForm.editImplant';

  private readonly existing = this.data.existing;

  /**
   * The copy of the case the next save is made against. Starts as the one the
   * dialog opened on; after a conflict it is the one someone else saved, so
   * the retry is checked against what the user has now been told about.
   */
  private readonly current = signal<RegistryCase>(this.existing);

  protected readonly form = this.fb.nonNullable.group({
    registryNo: [this.existing.registryNo, [Validators.required, digitString(1, 18)]],
    recordedName: [this.existing.recordedName, [Validators.required, Validators.maxLength(160)]],
    patientSearch: [''],
  });

  /** The link as it will be saved; starts as whatever the row already holds. */
  protected readonly linkedPatient = signal<LinkedPatient | null>(linkOf(this.existing));

  /** Whether the user has picked or cleared the link here; if not, a conflict may replace it. */
  private linkEdited = false;

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
    this.linkEdited = true;
    // The box shows the choice rather than the id the option carries.
    this.form.controls.patientSearch.setValue(match.fullName, { emitEvent: false });
  }

  protected unlink(): void {
    this.linkedPatient.set(null);
    this.linkEdited = true;
    this.form.controls.patientSearch.setValue('', { emitEvent: false });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();

    // Phones, status and notes are left out, so what is stored stays.
    const payload: RegistryCaseInput = {
      registryNo: toLatinDigits(raw.registryNo).trim(),
      recordedName: raw.recordedName.trim(),
    };

    // Only a changed link is sent: the API treats any `patientId` it
    // receives as a deliberate, manual decision about the match.
    const current = this.current();
    const linkedId = this.linkedPatient()?.id ?? null;
    if (linkedId !== current.patientId) payload.patientId = linkedId;

    this.registry
      .updateCase(this.data.kind, current.id, { ...payload, expectedVersion: current.version })
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.ref.close(saved);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          if (this.isConflict(error)) this.onConflict();
          else this.applyServerErrors(error);
        },
      });
  }

  private isConflict(error: unknown): boolean {
    return (
      error instanceof HttpErrorResponse &&
      (error.error as ApiErrorBody | null)?.code === 'ERR_REGISTRY_CASE_MODIFIED'
    );
  }

  /**
   * Someone else saved this case while the dialog was open. What the user
   * changed stays as typed; every field they left alone — the link included —
   * now shows what was saved, so the retry cannot quietly undo the other edit.
   * The message names what changed, and the next save is made against the
   * saved copy.
   */
  private onConflict(): void {
    const before = this.current();
    this.registry.getCase(this.data.kind, before.id).subscribe({
      next: (after) => {
        this.current.set(after);
        adoptUntouched(this.form, {
          registryNo: after.registryNo,
          recordedName: after.recordedName,
        });
        if (!this.linkEdited) this.linkedPatient.set(linkOf(after));
        const changed = changedCaseFields(before, after)
          .map((key) => this.i18n.instant(key))
          .join(this.i18n.instant('list.separator'));
        const message = changed
          ? this.i18n.instant('registryForm.conflict', { fields: changed })
          : this.i18n.instant('registryForm.conflictNoFields');
        this.snackBar.open(message, this.i18n.instant('action.dismiss'), { duration: 15000 });
      },
      // Most likely deleted meanwhile — a 404 the interceptor leaves to us.
      error: (error: unknown) =>
        this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
          duration: 15000,
        }),
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
