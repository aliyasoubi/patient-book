import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DateAdapter } from '@angular/material/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PatientsService } from './data/patients.service';
import {
  EDUCATION_LEVELS,
  GENDERS,
  educationLabel,
  genderLabel,
  treatmentColor,
} from '../../shared/labels';
import { iranianNationalId, iranianMobile } from '../../shared/validators';
import type { Patient, PatientInput, ReferralSource, TreatmentType } from './data/patient.model';
import type { EducationLevel, Gender } from '../../core/models/common.model';
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
import type { SelectOption, TextFieldOption } from '../../shared/ui';
import { applyPatientDateChanges } from './patient-form.utils';

@Component({
  selector: 'pb-patient-form',
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
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './patient-form.html',
  styleUrl: './patient-form.scss',
})
export class PatientForm {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  /** Present when editing; absent on `/patients/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly genderLabel = genderLabel;
  protected readonly educationLabel = educationLabel;
  protected readonly color = treatmentColor;

  protected readonly genderOptions: SelectOption[] = GENDERS.map((g) => ({
    value: g,
    label: genderLabel(g),
    translate: true,
  }));
  protected readonly educationOptions: SelectOption[] = EDUCATION_LEVELS.map((level) => ({
    value: level,
    label: educationLabel(level),
    translate: true,
  }));

  /** Overrides the generic "pattern" wording with one specific to this field. */
  protected readonly homePhoneErrors = computed(() => {
    this.i18n.currentLang();
    return { pattern: this.i18n.instant('field.homePhoneInvalid') };
  });

  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly treatmentTypes = signal<TreatmentType[]>([]);
  protected readonly referralSources = signal<ReferralSource[]>([]);
  protected readonly selectedTreatments = signal<Set<string>>(new Set());
  protected readonly original = signal<Patient | null>(null);

  protected readonly isEdit = computed(() => !!this.id());
  protected readonly title = computed(() =>
    this.isEdit() ? 'patientForm.editTitle' : 'patientForm.createTitle',
  );
  protected readonly submitLabel = computed(() =>
    this.isEdit() ? 'patientForm.saveLabel' : 'patientForm.createLabel',
  );

  protected readonly form = this.fb.nonNullable.group({
    fileNo: ['', [Validators.required, Validators.pattern(/^\d{1,24}$/)]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(120)]],
    fatherName: [''],
    nationalId: ['', [iranianNationalId]],
    gender: ['unknown' as Gender],
    mobile: ['', [iranianMobile]],
    homePhone: ['', [Validators.pattern(/^\d{4,15}$/)]],
    birthDate: [null as Date | null],
    occupation: [''],
    education: ['unknown' as EducationLevel],
    referralSourceName: [''],
    medicalHistory: [''],
    homeAddress: [''],
    workAddress: [''],
    firstVisitAt: [null as Date | null],
    lastVisitAt: [null as Date | null],
    notes: [''],
  });

  /** Referral suggestions matching what has been typed so far. */
  protected readonly referralMatches = computed<TextFieldOption[]>(() => {
    const typed = this.form.controls.referralSourceName.value.trim();
    const all = this.referralSources();
    const needle = typed.toLowerCase();
    const matches = typed ? all.filter((r) => r.name.toLowerCase().includes(needle)) : all;
    return matches
      .slice(0, 12)
      .map((r) => ({ value: r.name, label: r.name, meta: r.patientCount }));
  });

  constructor() {
    this.service.treatmentTypes().subscribe((types) => this.treatmentTypes.set(types));
    this.service.referralSources().subscribe((sources) => this.referralSources.set(sources));

    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.loadPatient(id) : this.prefillNew()));
    });
  }

  private prefillNew(): void {
    // Offer the next number in the practice's own sequence so nobody has to
    // hunt for the last one used.
    this.service.nextFileNo().subscribe(({ fileNo }) => {
      if (!this.form.controls.fileNo.value) {
        this.form.controls.fileNo.setValue(fileNo);
      }
    });
  }

  private loadPatient(id: string): void {
    this.loading.set(true);
    this.service.get(id).subscribe({
      next: (p) => {
        this.original.set(p);
        this.form.patchValue({
          fileNo: p.fileNo,
          firstName: p.firstName,
          lastName: p.lastName,
          fatherName: p.fatherName ?? '',
          nationalId: p.nationalId ?? '',
          gender: p.gender,
          mobile: p.mobile ?? '',
          homePhone: p.homePhone ?? '',
          birthDate: this.toDate(p.birthDate?.jalali),
          occupation: p.occupation ?? '',
          education: p.education,
          referralSourceName: p.referralSource?.name ?? '',
          medicalHistory: p.medicalHistory ?? '',
          homeAddress: p.homeAddress ?? '',
          workAddress: p.workAddress ?? '',
          firstVisitAt: this.toDate(p.firstVisitAt?.jalali),
          lastVisitAt: this.toDate(p.lastVisitAt?.jalali),
          notes: p.notes ?? '',
        });
        this.selectedTreatments.set(new Set(p.treatments.map((t) => t.code)));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigate(['/patients']);
      },
    });
  }

  /**
   * A year-only birth date such as `1368` cannot seed a datepicker, which needs
   * a full day. Rather than invent 1 Farvardin, the field is left empty and the
   * original value stays untouched unless the user actually picks a date.
   */
  private toDate(jalali: string | undefined): Date | null {
    if (!jalali || jalali.split('/').length !== 3) return null;
    const parsed = this.dateAdapter.parse(jalali, 'yyyy/MM/dd');
    return parsed && this.dateAdapter.isValid(parsed) ? parsed : null;
  }

  protected toggleTreatment(code: string): void {
    this.selectedTreatments.update((set) => {
      const next = new Set(set);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  protected isSelected(code: string): boolean {
    return this.selectedTreatments().has(code);
  }

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

    const payload: PatientInput = {
      fileNo: raw.fileNo.trim(),
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      fatherName: blank(raw.fatherName),
      nationalId: blank(raw.nationalId),
      gender: raw.gender,
      mobile: blank(raw.mobile),
      homePhone: blank(raw.homePhone),
      occupation: blank(raw.occupation),
      education: raw.education,
      referralSourceName: blank(raw.referralSourceName),
      medicalHistory: blank(raw.medicalHistory),
      homeAddress: blank(raw.homeAddress),
      workAddress: blank(raw.workAddress),
      notes: blank(raw.notes),
      treatments: [...this.selectedTreatments()].map((code) => ({ code })),
    };

    applyPatientDateChanges(
      payload,
      this.isEdit(),
      {
        birthDate: {
          value: raw.birthDate,
          dirty: this.form.controls.birthDate.dirty,
        },
        firstVisitAt: {
          value: raw.firstVisitAt,
          dirty: this.form.controls.firstVisitAt.dirty,
        },
        lastVisitAt: {
          value: raw.lastVisitAt,
          dirty: this.form.controls.lastVisitAt.dirty,
        },
      },
      (value) => this.dateAdapter.toIso8601(value),
    );

    const request = this.isEdit()
      ? this.service.update(this.id()!, payload)
      : this.service.create(payload);

    request.subscribe({
      next: (patient) => {
        this.saving.set(false);
        this.snackBar.open(
          this.isEdit()
            ? this.i18n.instant('patientForm.saved')
            : this.i18n.instant('patientForm.created'),
          this.i18n.instant('action.dismiss'),
        );
        void this.router.navigate(['/patients', patient.id]);
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

    // Per-field validation failures, keyed by the property path the API used.
    if (body?.fieldErrors) {
      for (const [path, failures] of Object.entries(body.fieldErrors)) {
        const control = this.form.get(path);
        const failure = failures[0];
        if (!control || !failure) continue;
        control.setErrors({ server: this.errors.field(path, failure.code, failure.params) });
        control.markAsTouched();
      }
    }

    // Single-code rejections that belong to one specific field.
    const fieldForCode: Partial<Record<string, keyof typeof this.form.controls>> = {
      ERR_FILE_NUMBER_TAKEN: 'fileNo',
      ERR_NATIONAL_ID_CHECKSUM: 'nationalId',
      ERR_NATIONAL_ID_LENGTH: 'nationalId',
      ERR_MOBILE_INVALID: 'mobile',
    };
    const target = body?.code ? fieldForCode[body.code] : undefined;
    const message = this.errors.translate(error);

    if (target) {
      this.form.controls[target].setErrors({ server: message });
      this.form.controls[target].markAsTouched();
    }
    this.snackBar.open(message, this.i18n.instant('action.dismiss'), { duration: 6000 });
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/patients', id] : ['/patients']);
  }
}
