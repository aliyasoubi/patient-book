import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  type Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators, type FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DateAdapter } from '@angular/material/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { RegistryService } from '../../core/services/registry.service';
import { HasUnsavedChanges, warnBeforeUnload } from '../../core/guards/unsaved-changes.guard';
import {
  ABUTMENT_TYPES,
  FOLLOW_UP_MONTHS,
  IMPLANT_BRAND_KEYS,
  KIND_FOLLOW_UP_MONTHS,
  SURGERY_KINDS,
  abutmentLabel,
  surgeryKindIcon,
  surgeryKindLabel,
} from '../../shared/labels';
import { formatPersianCount } from '../../shared/pipes/persian-number.pipe';
import { digitString, identifierValue } from '../../shared/validators';
import {
  adoptUntouched,
  changedFields,
  dropPickOnRetype,
  type FieldReader,
} from '../../shared/form-sync';
import { PatientsService } from '../patients/data/patients.service';
import type { PatientSuggestion } from '../patients/data/patient.model';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import type { SurgeryKind, SurgeryQueueItem } from '../../core/models/common.model';
import {
  PbButton,
  PbDateField,
  PbFieldGrid,
  PbFormActions,
  PbIconButton,
  PbPage,
  PbPageHeader,
  PbSelectField,
  PbStatusChip,
  PbSurface,
  PbTextField,
  PbTextareaField,
  PbToothPicker,
} from '../../shared/ui';
import type { SelectOption, TextFieldOption } from '../../shared/ui';
import { AuthService } from '../../core/services/auth.service';
import { ListReturn } from '../../core/services/list-return.service';

const SURGERY_FIELDS: readonly FieldReader<SurgeryQueueItem>[] = [
  ['surgeryForm.recordedName', (s) => `${s.recordedName}|${s.patient?.id ?? ''}`],
  ['surgeryForm.surgeryDate', (s) => s.surgeryDate?.jalali ?? null],
  ['surgeryForm.teeth', (s) => `${s.teethFdi.join(' ')}|${s.toothPosition}`],
  ['surgeryForm.implantRegistryNo', (s) => s.implantRegistryNo],
  ['surgeryForm.implantBrand', (s) => s.implantBrand],
  ['surgeryForm.abutmentType', (s) => s.abutmentType],
  // Months and where it stands with the patient are both "the follow-up" to the user.
  [
    'surgeryForm.followUp',
    (s) => `${s.followUpMonths}|${s.followUpStatus}|${s.followUpAppointmentAt}`,
  ],
  ['surgeryForm.notes', (s) => s.notes],
];

/**
 * Fills the register number with the picked patient's implant file. A value
 * set from code stays pristine, but this one follows the user's choice:
 * marked dirty, it is sent with the save, and conflict recovery keeps it
 * beside the patient it came with instead of restoring the old number under
 * the new name.
 */
export function pickRegistryNo(
  control: FormControl<string>,
  registryNo: string | null | undefined,
): void {
  if (!registryNo) return;
  control.setValue(registryNo);
  control.markAsDirty();
}

/**
 * Label keys of the fields that differ between two copies of a row — what a
 * conflict message lists so the user knows what someone else changed.
 */
export function changedSurgeryFields(before: SurgeryQueueItem, after: SurgeryQueueItem): string[] {
  return changedFields(before, after, SURGERY_FIELDS);
}

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
    PbStatusChip,
    PbPageHeader,
    TranslatePipe,
    PbPage,
    PbFieldGrid,
    PbFormActions,
    PbIconButton,
    PbToothPicker,
    MatIconModule,
  ],
  templateUrl: './surgery-form.html',
  styleUrl: './surgery-form.scss',
})
export class SurgeryForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly canEditClinicalNotes = this.auth.can('editClinicalNotes');
  private readonly registry = inject(RegistryService);
  private readonly patients = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** The list this form was opened from, with its search and filters. */
  private readonly listReturn = inject(ListReturn);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  /** Present when editing; absent on `/surgery/new`. */
  readonly id = input<string | undefined>(undefined);
  protected readonly isEdit = computed(() => !!this.id());
  protected readonly title = computed(() =>
    this.isEdit() ? 'surgeryForm.editTitle' : 'surgeryForm.createTitle',
  );
  protected readonly submitLabel = computed(() =>
    this.isEdit() ? 'surgeryForm.saveLabel' : 'surgeryForm.createLabel',
  );

  protected readonly kindLabel = surgeryKindLabel;
  protected readonly kindIcon = surgeryKindIcon;
  protected readonly kindOptions: SelectOption[] = SURGERY_KINDS.map((kind) => ({
    value: kind,
    label: surgeryKindLabel(kind),
    translate: true,
  }));
  protected readonly abutmentOptions: SelectOption[] = ABUTMENT_TYPES.map((a) => ({
    value: a,
    label: abutmentLabel(a),
    translate: true,
  }));
  /**
   * The API stores the brand's display name itself, not a key — so unlike the
   * other option lists here, this one resolves eagerly to real Persian text
   * instead of deferring to the `translate` pipe, and re-reads `currentLang()`
   * so it would follow a language change instead of freezing at construction.
   */
  protected readonly brandOptions = computed<SelectOption[]>(() => {
    this.i18n.currentLang();
    return IMPLANT_BRAND_KEYS.map((key) => {
      const name = this.i18n.instant(`implantBrand.${key}`);
      return { value: name, label: name };
    });
  });

  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  /** Set once the save round-trips, so the post-save navigation is not challenged. */
  private saved = false;

  /**
   * How long after the surgery the follow-up falls. The defaults are the
   * healing windows: two months after an extraction before an implant can
   * be planned, three after an implant before its prosthesis; see
   * {@link KIND_FOLLOW_UP_MONTHS} for the rest. The API turns the choice into
   * a date.
   */
  protected readonly followUpOptions = computed<SelectOption[]>(() => {
    this.i18n.currentLang();
    return FOLLOW_UP_MONTHS.map((months) => ({
      value: String(months),
      label: this.i18n.instant('surgeryForm.followUpAfter', { months: formatPersianCount(months) }),
    }));
  });

  protected readonly form = this.fb.nonNullable.group({
    kind: ['implant' as SurgeryKind],
    recordedName: ['', [Validators.required, Validators.maxLength(160)]],
    implantRegistryNo: ['', [digitString(1, 18)]],
    surgeryDate: [null as Date | null],
    teeth: [[] as number[]],
    implantBrand: [''],
    abutmentType: ['unknown'],
    followUpMonths: ['3'],
    notes: ['', [Validators.maxLength(2000)]],
  });

  /** Register number, brand and cover belong to an implant; the other kinds have teeth and a date. */
  protected readonly isImplant = toSignal(
    this.form.controls.kind.valueChanges.pipe(map((kind) => kind === 'implant')),
    { initialValue: true },
  );

  private readonly surgeryDateValue = toSignal(this.form.controls.surgeryDate.valueChanges, {
    initialValue: null as Date | null,
  });
  private readonly followUpMonthsValue = toSignal(this.form.controls.followUpMonths.valueChanges, {
    initialValue: '3',
  });
  /**
   * LEGACY: the row's imported prosthesis note, shown when no date can be
   * derived. Remove with the runtime fallbacks listed in
   * apps/api/src/modules/surgery/legacy-prosthesis-due.ts.
   */
  private readonly legacyProsthesisDue = signal<string | null>(null);

  /**
   * The phrase an older row was written with, shown while it has no teeth
   * picked: the chart cannot read it, and saving without picking leaves it be.
   */
  protected readonly legacyTeeth = computed(() => {
    const loaded = this.loaded();
    return loaded && !loaded.teethFdi.length ? loaded.toothPosition || null : null;
  });

  /**
   * The copy of the row an edit is saved against. Set on load; after a
   * conflict it is the one someone else saved, so the retry is checked
   * against what the user has now been told about.
   */
  private readonly loaded = signal<SurgeryQueueItem | null>(null);

  /** What the chosen months resolve to, so the dentist sees the date, not just "3". */
  protected readonly followUpHint = computed(() => {
    this.i18n.currentLang();
    const date = this.surgeryDateValue();
    const months = Number(this.followUpMonthsValue());
    if (date && months) {
      const due = this.dateAdapter.addCalendarMonths(date, months);
      // The adapter already renders Persian numerals.
      return this.i18n.instant('surgeryForm.followUpOn', {
        date: this.dateAdapter.format(due, 'yyyy/MM/dd'),
      });
    }
    if (!months) return null;
    const legacy = this.legacyProsthesisDue();
    if (legacy) return this.i18n.instant('surgeryForm.followUpLegacy', { note: legacy });
    return this.i18n.instant('surgeryForm.followUpNeedsDate');
  });

  /** The patient file the follow-up is for; picking a name from the book sets it. */
  protected readonly linkedPatient = signal<SurgeryQueueItem['patient']>(null);
  /** The user picked or unlinked a patient here — a conflict must not undo that. */
  private linkChanged = false;
  /** The implant file number a picked patient brought in, to give back if they are unpicked. */
  private registryFromPatient: string | null = null;

  /**
   * Patients whose name, mobile or file number matches what's been typed so
   * far. `switchMap` drops the response to an earlier, slower query, so a
   * result for "Ali" cannot land after — and replace — the one for "Alireza".
   */
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
      meta: this.i18n.instant('surgery.patientFile', { fileNo: p.fileNo }),
    }));
  });

  constructor() {
    warnBeforeUnload(() => this.hasUnsavedChanges());
    // Another name typed over the linked one is someone else: the row is
    // unlinked until a patient is picked again, and a conflict will not link
    // it back.
    dropPickOnRetype(this.form.controls.recordedName, this.linkedPatient, () => this.unlink());
    effect(() => {
      const id = this.id();
      untracked(() => {
        if (id) return this.loadSurgery(id);
        this.prefillNew();
        this.prefillPatient(this.route.snapshot.queryParamMap.get('patientId'));
      });
    });
  }

  /** Opened from a patient's page: the follow-up is that patient's from the start. */
  private prefillPatient(patientId: string | null): void {
    if (!patientId) return;
    this.patients.get(patientId).subscribe({
      next: (p) => {
        const fullName = `${p.firstName} ${p.lastName}`.trim();
        this.linkedPatient.set({ id: p.id, fileNo: p.fileNo, fullName, mobile: p.mobile });
        this.linkChanged = true;
        this.form.controls.recordedName.setValue(fullName, { emitEvent: false });
        if (this.isImplant()) this.useImplantFile(p.implantCases?.[0]?.registryNo);
      },
      error: () => undefined,
    });
  }

  /**
   * Switching kind resets what the other kind does not have, and offers that
   * kind's usual follow-up. Only a new row offers the choice: a saved row's
   * kind is settled, and one recorded under the wrong kind is deleted and
   * added again rather than converted in place — the fewer things an edit
   * can change, the fewer a slip can change.
   */
  protected onKindChange(kind: SurgeryKind): void {
    this.form.controls.kind.setValue(kind);
    this.form.controls.followUpMonths.setValue(String(KIND_FOLLOW_UP_MONTHS[kind]));
    if (kind === 'implant') {
      this.prefillNew();
      // A patient picked under another kind has an implant file to go into.
      const linked = this.linkedPatient();
      if (linked) this.fetchImplantFile(linked.id);
    } else {
      this.form.patchValue({ implantRegistryNo: '', implantBrand: '', abutmentType: 'unknown' });
      this.form.controls.implantRegistryNo.markAsPristine();
      this.registryFromPatient = null;
    }
  }

  /**
   * Offer the implant book's next number so nobody has to look one up — or
   * reach for the patient's file number instead, which has happened. Picking
   * an existing case from the name list still overrides it.
   */
  private prefillNew(): void {
    this.registry.nextRegistryNo().subscribe(({ registryNo }) => {
      if (!this.form.controls.implantRegistryNo.value) {
        this.form.controls.implantRegistryNo.setValue(registryNo);
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.form.dirty;
  }

  private loadSurgery(id: string): void {
    this.loading.set(true);
    this.registry.getSurgery(id).subscribe({
      next: (item) => {
        this.applyItem(item);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.listReturn.urlFor('/surgery'));
      },
    });
  }

  private applyItem(item: SurgeryQueueItem): void {
    this.form.patchValue(this.formValues(item));
    this.legacyProsthesisDue.set(item.prosthesisDue);
    this.loaded.set(item);
    this.linkedPatient.set(item.patient);
    this.linkChanged = false;
  }

  /** The row as the form's controls hold it. */
  private formValues(item: SurgeryQueueItem) {
    return {
      kind: item.kind,
      recordedName: item.recordedName,
      implantRegistryNo: item.implantRegistryNo ?? '',
      surgeryDate: this.toDate(item.surgeryDate?.jalali),
      teeth: item.teethFdi,
      implantBrand: item.implantBrand ?? '',
      abutmentType: item.abutmentType,
      followUpMonths: item.followUpMonths ? String(item.followUpMonths) : '',
      notes: item.notes ?? '',
    };
  }

  /**
   * A date whose day component is imprecise (a month/year-only record) cannot
   * seed a datepicker, which needs a full day — left empty rather than guessing.
   */
  private toDate(jalali: string | undefined): Date | null {
    if (!jalali || jalali.split('/').length !== 3) return null;
    const parsed = this.dateAdapter.parse(jalali, 'yyyy/MM/dd');
    return parsed && this.dateAdapter.isValid(parsed) ? parsed : null;
  }

  /**
   * Picking a patient links the follow-up to their file: its number and the
   * phone to call come from there. A new implant row also takes the
   * patient's implant file number, so it lands in their one file.
   */
  protected onPatientSelected(option: TextFieldOption): void {
    const match = this.patientMatches().find((p) => p.id === option.value);
    if (!match) return;
    this.linkedPatient.set({
      id: match.id,
      fileNo: match.fileNo,
      fullName: match.fullName,
      mobile: match.mobile,
    });
    this.linkChanged = true;
    this.form.controls.recordedName.setValue(match.fullName, { emitEvent: false });
    this.form.controls.recordedName.markAsDirty();
    this.fetchImplantFile(match.id);
  }

  protected unlink(): void {
    this.linkedPatient.set(null);
    this.linkChanged = true;
    this.form.markAsDirty();
    this.releaseImplantFile();
  }

  /** A new implant row looks up the linked patient's implant file. */
  private fetchImplantFile(patientId: string): void {
    if (!this.isImplant() || this.isEdit()) return;
    this.patients.get(patientId).subscribe({
      next: (p) => {
        if (this.linkedPatient()?.id === p.id) this.useImplantFile(p.implantCases?.[0]?.registryNo);
      },
      error: () => undefined,
    });
  }

  /**
   * A new row goes into the patient's implant file when they have one. A
   * number the user typed is theirs to keep; with no file, the book's next
   * number stays, and the API opens it as this patient's file. A number an
   * earlier pick brought in is that patient's, never the next one's.
   */
  private useImplantFile(registryNo: string | null | undefined): void {
    const control = this.form.controls.implantRegistryNo;
    if (this.isEdit()) return;
    if (control.dirty && control.value !== this.registryFromPatient) return;
    if (!registryNo) {
      this.releaseImplantFile();
      return;
    }
    pickRegistryNo(control, registryNo);
    this.registryFromPatient = registryNo;
  }

  /** The number a patient no longer linked brought in goes back to the book's next. */
  private releaseImplantFile(): void {
    const control = this.form.controls.implantRegistryNo;
    if (this.isEdit() || !this.registryFromPatient) return;
    if (control.value !== this.registryFromPatient) return;
    this.registryFromPatient = null;
    control.setValue('');
    control.markAsPristine();
    if (this.isImplant()) this.prefillNew();
  }

  protected setTeeth(teeth: number[]): void {
    const control = this.form.controls.teeth;
    control.setValue(teeth);
    control.markAsDirty();
  }

  protected submit(): void {
    // Never save while a load is in flight: the form would be a mix of the
    // previous record and whatever has been patched in so far.
    if (this.loading()) return;
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

    const implant = raw.kind === 'implant';
    const payload: Record<string, unknown> = {
      recordedName: raw.recordedName.trim(),
      // Sent when the link was made or cleared here, and always on a new
      // row; an edit that left it alone does not restate it.
      ...(!this.isEdit() || this.linkChanged
        ? { patientId: this.linkedPatient()?.id ?? null }
        : {}),
      // The legacy phrase is not sent: the chart replaces it, and an older
      // row that is saved without picking keeps what it was written with.
      teethFdi: raw.teeth,
      // Only an implant carries the implant fields; clear them so a new
      // row whose kind was switched before saving does not keep a stale
      // number or brand typed under the other one.
      implantBrand: implant ? raw.implantBrand || null : null,
      abutmentType: implant ? raw.abutmentType : 'unknown',
      followUpMonths: raw.followUpMonths ? Number(raw.followUpMonths) : null,
      notes: blank(raw.notes),
    };
    // Sent only when the row is created; the edit form does not offer it.
    if (!this.isEdit()) payload['kind'] = raw.kind;
    // The register number is the link to a case, so an edit sends it only
    // when the user changed it — by typing or by picking a name. Sent
    // untouched it could only ever restate the link the row already has, and
    // an empty one (an older row linked without its number copied) would
    // read as "unlink". A new row always sends it.
    const registryNo = this.form.controls.implantRegistryNo;
    if (!this.isEdit() || registryNo.dirty || !implant) {
      payload['implantRegistryNo'] = implant ? identifierValue(raw.implantRegistryNo) : null;
    }
    // Whether the follow-up happened is the switch on the card, not a form
    // field: every row added here is waiting for its follow-up.
    // The date is only sent when this form owns it. A pristine empty picker on
    // an edit may stand for a month-only imported date that must survive; a
    // picker the user cleared is a request to clear, so `null` goes out —
    // omitting it would read as "leave the date alone" on the API.
    const date = this.form.controls.surgeryDate;
    if (raw.surgeryDate) {
      payload['surgeryDate'] = this.dateAdapter.toIso8601(raw.surgeryDate);
    } else if (this.isEdit() && date.dirty) {
      payload['surgeryDate'] = null;
    }

    // An edit names the version it was made from; the API refuses a stale one.
    // The loaded row is always here on an edit — `submit` refuses to run
    // while a load is in flight — so a missing one must not become a create.
    if (this.isEdit()) {
      const loaded = this.loaded();
      if (!loaded) {
        this.saving.set(false);
        return;
      }
      payload['expectedVersion'] = loaded.version;
    }

    this.registry.saveSurgery(this.id() ?? null, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(
          this.isEdit()
            ? this.i18n.instant('surgeryForm.saved')
            : this.i18n.instant('surgeryForm.created'),
          this.i18n.instant('action.dismiss'),
        );
        this.saved = true;
        void this.router.navigateByUrl(this.listReturn.urlFor('/surgery'));
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
      (error.error as ApiErrorBody | null)?.code === 'ERR_SURGERY_ITEM_MODIFIED'
    );
  }

  /**
   * Someone else saved this row while it was being edited here. What the
   * user changed stays as typed; every field they left alone now shows what
   * was saved, so the retry cannot quietly undo the other edit. The message
   * names what changed, and the next save is made against the saved copy.
   */
  private onConflict(): void {
    const before = this.loaded();
    if (!before) return;
    this.registry.getSurgery(before.id).subscribe({
      next: (after) => {
        this.loaded.set(after);
        this.legacyProsthesisDue.set(after.prosthesisDue);
        adoptUntouched(this.form, this.formValues(after));
        if (!this.linkChanged) this.linkedPatient.set(after.patient);
        const changed = changedSurgeryFields(before, after)
          .map((key) => this.i18n.instant(key))
          .join(this.i18n.instant('list.separator'));
        const message = changed
          ? this.i18n.instant('surgeryForm.conflict', { fields: changed })
          : this.i18n.instant('surgeryForm.conflictNoFields');
        this.snackBar.open(message, this.i18n.instant('action.dismiss'), { duration: 15000 });
      },
      // Most likely deleted meanwhile — a 404 the interceptor leaves to us.
      error: (error: unknown) =>
        this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'), {
          duration: 15000,
        }),
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
    void this.router.navigateByUrl(this.listReturn.urlFor('/surgery'));
  }
}
