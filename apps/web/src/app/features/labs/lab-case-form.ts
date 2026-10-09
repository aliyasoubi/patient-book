import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DateAdapter } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addDays } from 'date-fns-jalali';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import { HasUnsavedChanges, warnBeforeUnload } from '../../core/guards/unsaved-changes.guard';
import type {
  Lab,
  LabCase,
  LabJaw,
  LabTripKind,
  LabWorkType,
} from '../../core/models/common.model';
import { LabCaseInput, LabService } from '../../core/services/lab.service';
import { PatientsService } from '../patients/data/patients.service';
import type { PatientSuggestion } from '../patients/data/patient.model';
import { adoptUntouched } from '../../shared/form-sync';
import {
  IMPLANT_BRAND_KEYS,
  LAB_JAWS,
  isJawWork,
  labJawLabel,
  defaultLabWaitDays,
  labTripKindLabel,
} from '../../shared/labels';
import { PersianNumberPipe, formatPersianCount } from '../../shared/pipes/persian-number.pipe';
import { toLatinDigits } from '../../shared/validators';
import {
  PbButton,
  PbDateField,
  PbFieldGrid,
  PbFilterChips,
  PbFormActions,
  PbIconButton,
  PbPage,
  PbPageHeader,
  PbSegmentedButton,
  PbSelectField,
  PbSurface,
  PbTextField,
  PbTextareaField,
} from '../../shared/ui';
import type { SegmentOption, SelectOption, TextFieldOption } from '../../shared/ui';
import { labTripKindOptions, labWaitOptions, labWorkTypeOptions } from './lab-options';
import { LabToothPicker } from './lab-tooth-picker';

interface LinkedPatient {
  id: string;
  fileNo: string;
  fullName: string;
}

/** A count typed in either digit script, within bounds — or nothing. */
function count(min: number, max: number) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const raw = toLatinDigits(control.value ?? '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return /^\d+$/.test(raw) && n >= min && n <= max ? null : { pattern: true };
  };
}

const countValue = (raw: string): number | null => {
  const value = toLatinDigits(raw).trim();
  return value ? Number(value) : null;
};

const atLeastOne = (control: AbstractControl<string[]>): ValidationErrors | null =>
  control.value.length ? null : { required: true };

/** Teeth are asked for unless the work is made per jaw. */
const teethUnlessJawWork = (control: AbstractControl<number[]>): ValidationErrors | null => {
  const types = (control.parent?.get('workTypes')?.value ?? []) as string[];
  return types.some((type) => isJawWork(type as LabWorkType)) || control.value.length
    ? null
    : { required: true };
};

/**
 * Opens a lab case with its first trip, or corrects one — its own fields and
 * its latest trip. Moving a case (received, sent again, delivered) is the
 * board's job, not this form's.
 */
@Component({
  selector: 'pb-lab-case-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    PersianNumberPipe,
    PbButton,
    PbDateField,
    PbFieldGrid,
    PbFilterChips,
    PbFormActions,
    PbIconButton,
    PbPage,
    PbPageHeader,
    PbSegmentedButton,
    PbSelectField,
    PbSurface,
    PbTextField,
    PbTextareaField,
    LabToothPicker,
  ],
  templateUrl: './lab-case-form.html',
  styleUrl: './lab-case-form.scss',
})
export class LabCaseForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly labs = inject(LabService);
  private readonly patients = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  /** Present when editing; absent on `/labs/new`. */
  readonly id = input<string | undefined>(undefined);
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly tripKindLabel = labTripKindLabel;
  protected readonly workTypeOptions = labWorkTypeOptions();
  protected readonly tripKindOptions = labTripKindOptions();

  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  private saved = false;

  /** The copy an edit is saved against; after a conflict, the one someone else saved. */
  protected readonly loaded = signal<LabCase | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    recordedName: ['', [Validators.required, Validators.maxLength(160)]],
    labId: ['', Validators.required],
    workTypes: this.fb.nonNullable.control<string[]>([], atLeastOne),
    // After `workTypes`: its validator reads the work type from the group.
    teeth: this.fb.nonNullable.control<number[]>([], teethUnlessJawWork),
    jaw: ['upper' as LabJaw],
    implantBrand: [''],
    impressionCount: ['', count(0, 32)],
    analogCount: ['', count(0, 32)],
    tripKind: ['impression', Validators.required],
    sentAt: [new Date() as Date | null, Validators.required],
    waitDays: ['7', Validators.required],
    tripNote: ['', Validators.maxLength(300)],
    notes: ['', Validators.maxLength(2000)],
  });

  private readonly workTypesValue = toSignal(this.form.controls.workTypes.valueChanges, {
    initialValue: [] as string[],
  });
  /** A night guard or SX is made per jaw: the jaw replaces the teeth. */
  protected readonly isJawWork = computed(() => {
    const types = this.workTypesValue();
    return types.length === 1 && isJawWork(types[0] as LabWorkType);
  });

  /** What a case written before the chart says about its teeth, shown until it is picked again. */
  protected readonly legacyTeeth = computed(() => {
    const c = this.loaded();
    if (!c || c.teethFdi.length || c.jaw) return null;
    const written = [
      c.toothCount
        ? this.i18n.instant('labs.toothCount', { count: formatPersianCount(c.toothCount) })
        : '',
      c.teeth,
    ]
      .filter(Boolean)
      .join(' · ');
    return written || null;
  });
  protected readonly jawOptions: SegmentOption[] = LAB_JAWS.map((jaw) => ({
    value: jaw,
    label: labJawLabel(jaw),
    translate: true,
  }));

  protected readonly isImplantCrown = computed(() =>
    this.workTypesValue().includes('implant_crown'),
  );

  // -- Options ------------------------------------------------------------------

  private readonly labList = signal<Lab[]>([]);
  /** Active labs, plus this case's own lab if it has since been deactivated. */
  protected readonly labOptions = computed<SelectOption[]>(() => {
    const current = this.loaded()?.lab?.id ?? null;
    return this.labList()
      .filter((l) => l.isActive || l.id === current)
      .map((l) => ({ value: l.id, label: l.name }));
  });

  /** As on the surgery form: the API stores the brand's display name, so it resolves eagerly. */
  protected readonly brandOptions = computed<SelectOption[]>(() => {
    this.i18n.currentLang();
    return IMPLANT_BRAND_KEYS.map((key) => {
      const name = this.i18n.instant(`implantBrand.${key}`);
      return { value: name, label: name };
    });
  });

  protected readonly waitOptions = computed(() => {
    this.i18n.currentLang();
    return labWaitOptions(this.i18n, this.loaded()?.trips.at(-1)?.waitDays);
  });

  private readonly tripValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.value,
  });
  /** The day the trip is due back, so nobody has to count. */
  protected readonly expectedHint = computed(() => {
    this.i18n.currentLang();
    const { sentAt, waitDays } = this.tripValue();
    if (!sentAt || !waitDays) return null;
    return this.i18n.instant('labForm.expectedOn', {
      date: this.dateAdapter.format(addDays(sentAt, Number(waitDays)), 'yyyy/MM/dd'),
    });
  });

  // -- The patient --------------------------------------------------------------

  /** The patient file the case belongs to; picking a name from the book sets it. */
  protected readonly linkedPatient = signal<LinkedPatient | null>(null);
  /** The user picked or unlinked a patient here — a conflict must not undo that. */
  private linkChanged = false;

  private readonly patientMatches: Signal<PatientSuggestion[]> = toSignal(
    this.form.controls.recordedName.valueChanges.pipe(
      debounceTime(250),
      map((v) => v.trim()),
      distinctUntilChanged(),
      switchMap((q) => {
        // Picking an option writes its value — the id — before the name replaces it.
        const current = this.patientMatches();
        if (current.some((p) => p.id === q)) return of(current);
        if (q.length < 2) return of<PatientSuggestion[]>([]);
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
      meta: this.i18n.instant('labs.patientFile', { fileNo: p.fileNo }),
    }));
  });

  constructor() {
    warnBeforeUnload(() => this.hasUnsavedChanges());
    this.labs.labs().subscribe({
      next: (labs) => {
        this.labList.set(labs);
        // A practice that mostly uses one lab should not have to pick it every time.
        if (!this.isEdit() && !this.form.controls.labId.value) {
          const first = labs.find((l) => l.isActive);
          if (first) this.form.controls.labId.setValue(first.id);
        }
      },
      error: () => undefined,
    });

    // Teeth are required for per-tooth work only, so a change of work re-checks them.
    this.form.controls.workTypes.valueChanges.subscribe(() =>
      this.form.controls.teeth.updateValueAndValidity(),
    );

    // Until someone picks a turnaround, it follows the work: three weeks for
    // laminates, one for the rest.
    this.form.controls.workTypes.valueChanges.subscribe((types) => {
      const wait = this.form.controls.waitDays;
      if (!this.isEdit() && !wait.dirty) {
        wait.setValue(String(defaultLabWaitDays(types as LabWorkType[])));
      }
    });

    effect(() => {
      const id = this.id();
      untracked(() => {
        if (id) this.load(id);
        else this.prefillPatient(this.route.snapshot.queryParamMap.get('patientId'));
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  /** Opened from a patient's page: the case belongs to that patient from the start. */
  private prefillPatient(patientId: string | null): void {
    if (!patientId) return;
    this.patients.get(patientId).subscribe({
      next: (p) => {
        const fullName = `${p.firstName} ${p.lastName}`.trim();
        this.linkedPatient.set({ id: p.id, fileNo: p.fileNo, fullName });
        this.form.controls.recordedName.setValue(fullName, { emitEvent: false });
      },
      error: () => undefined,
    });
  }

  protected onPatientSelected(option: TextFieldOption): void {
    const match = this.patientMatches().find((p) => p.id === option.value);
    if (!match) return;
    this.linkedPatient.set({ id: match.id, fileNo: match.fileNo, fullName: match.fullName });
    this.linkChanged = true;
    this.form.controls.recordedName.setValue(match.fullName, { emitEvent: false });
    this.form.controls.recordedName.markAsDirty();
  }

  protected unlink(): void {
    this.linkedPatient.set(null);
    this.linkChanged = true;
    this.form.markAsDirty();
  }

  protected setJaw(jaw: LabJaw): void {
    this.form.controls.jaw.setValue(jaw);
    this.form.controls.jaw.markAsDirty();
  }

  protected setTeeth(teeth: number[]): void {
    const control = this.form.controls.teeth;
    control.setValue(teeth);
    control.markAsDirty();
    control.markAsTouched();
  }

  protected setWorkTypes(types: string[]): void {
    const control = this.form.controls.workTypes;
    // One kind of work per case; tapping the chosen chip again leaves none chosen.
    control.setValue(types.slice(0, 1));
    control.markAsDirty();
    control.markAsTouched();
  }

  private load(id: string): void {
    this.loading.set(true);
    this.labs.get(id).subscribe({
      next: (c) => {
        this.apply(c);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigate(['/labs']);
      },
    });
  }

  private apply(c: LabCase): void {
    this.loaded.set(c);
    this.form.reset(this.formValues(c));
    this.linkedPatient.set(this.linkOf(c));
    this.linkChanged = false;
  }

  private linkOf(c: LabCase): LinkedPatient | null {
    return c.patient
      ? { id: c.patient.id, fileNo: c.patient.fileNo, fullName: c.patient.fullName }
      : null;
  }

  /** The case as the form's controls hold it; the trip fields are its latest trip. */
  private formValues(c: LabCase) {
    const trip = c.trips.at(-1);
    return {
      recordedName: c.recordedName,
      labId: c.lab?.id ?? '',
      // A case opened before there was one choice may hold several: it asks for one.
      workTypes: c.workTypes.length === 1 ? [...c.workTypes] : [],
      jaw: c.jaw ?? ('upper' as LabJaw),
      teeth: [...c.teethFdi],
      implantBrand: c.implantBrand ?? '',
      impressionCount: c.impressionCount !== null ? String(c.impressionCount) : '',
      analogCount: c.analogCount !== null ? String(c.analogCount) : '',
      tripKind: trip?.kind ?? 'impression',
      sentAt: trip ? this.dateAdapter.parse(trip.sentAt, 'yyyy/MM/dd') : null,
      waitDays: trip ? String(trip.waitDays) : '7',
      tripNote: trip?.note ?? '',
      notes: c.notes ?? '',
    };
  }

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      const firstInvalid = document.querySelector<HTMLElement>(
        '.form input.ng-invalid, .form textarea.ng-invalid, .form mat-select.ng-invalid, .form [aria-invalid="true"]',
      );
      firstInvalid?.focus();
      firstInvalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const raw = this.form.getRawValue();
    const blank = (v: string): string | null => v.trim() || null;
    const implant = raw.workTypes.includes('implant_crown');
    const jawWork = this.isJawWork();
    const body: LabCaseInput = {
      patientId: this.linkedPatient()?.id ?? null,
      recordedName: raw.recordedName.trim(),
      labId: raw.labId,
      workTypes: raw.workTypes as LabWorkType[],
      // One or the other: per-jaw work by its jaw, everything else by its teeth.
      jaw: jawWork ? raw.jaw : null,
      teethFdi: jawWork ? [] : raw.teeth,
      // The parts go with an implant crown only; a case that is no longer one
      // must not keep owing them.
      implantBrand: implant ? raw.implantBrand || null : null,
      impressionCount: implant ? countValue(raw.impressionCount) : null,
      analogCount: implant ? countValue(raw.analogCount) : null,
      notes: blank(raw.notes),
      tripKind: raw.tripKind as LabTripKind,
      sentAt: this.dateAdapter.toIso8601(raw.sentAt!),
      waitDays: Number(raw.waitDays),
      tripNote: blank(raw.tripNote),
    };

    const loaded = this.loaded();
    if (this.isEdit() && !loaded) return;
    this.saving.set(true);
    const request = loaded
      ? this.labs.update(loaded.id, { ...body, expectedVersion: loaded.version })
      : this.labs.create(body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved = true;
        this.snackBar.open(
          this.i18n.instant(loaded ? 'labForm.saved' : 'labForm.created'),
          this.i18n.instant('action.dismiss'),
        );
        void this.router.navigate(['/labs']);
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
      (error.error as ApiErrorBody | null)?.code === 'ERR_LAB_CASE_MODIFIED'
    );
  }

  /**
   * Someone else saved or moved this case while it was open here. What the
   * user changed stays as typed; everything else now shows what was saved,
   * and the next save is made against that copy.
   */
  private onConflict(): void {
    const before = this.loaded();
    if (!before) return;
    this.labs.get(before.id).subscribe({
      next: (after) => {
        this.loaded.set(after);
        adoptUntouched(this.form, this.formValues(after));
        if (!this.linkChanged) this.linkedPatient.set(this.linkOf(after));
        this.snackBar.open(
          this.i18n.instant('labForm.conflict'),
          this.i18n.instant('action.dismiss'),
          { duration: 15000 },
        );
      },
      error: (error: unknown) =>
        this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
          duration: 15000,
        }),
    });
  }

  private applyServerErrors(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) return;
    const body = error.error as ApiErrorBody | null;
    for (const [path, failures] of Object.entries(body?.fieldErrors ?? {})) {
      const control = this.form.get(path);
      const failure = failures[0];
      if (!control || !failure) continue;
      control.setErrors({ server: this.errors.field(path, failure.code, failure.params) });
      control.markAsTouched();
    }
    this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
      duration: 6000,
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/labs']);
  }
}
