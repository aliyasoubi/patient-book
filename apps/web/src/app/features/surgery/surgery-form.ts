import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DateAdapter } from '@angular/material/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { RegistryService } from '../../core/services/registry.service';
import {
  HasUnsavedChanges,
  warnBeforeUnload,
} from '../../core/guards/unsaved-changes.guard';
import {
  ABUTMENT_TYPES,
  FOLLOW_UP_MONTHS,
  IMPLANT_BRAND_KEYS,
  SURGERY_KINDS,
  abutmentLabel,
  surgeryKindLabel,
} from '../../shared/labels';
import { formatPersianCount } from '../../shared/pipes/persian-number.pipe';
import { digitString, identifierValue } from '../../shared/validators';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';
import type { RegistryCase, SurgeryKind, SurgeryQueueItem } from '../../core/models/common.model';
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

@Component({
  selector: 'pb-surgery-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatIconModule,
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
export class SurgeryForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly registry = inject(RegistryService);
  private readonly router = inject(Router);
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

  protected readonly kinds = SURGERY_KINDS;
  protected readonly kindLabel = surgeryKindLabel;
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
   * be planned, three after an implant before its prosthesis. The API turns
   * the choice into a date.
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
    implantRegistryNo: ['', [digitString(1, 24)]],
    surgeryDate: [null as Date | null],
    toothPosition: ['', [Validators.maxLength(200)]],
    implantBrand: [''],
    abutmentType: ['unknown'],
    followUpMonths: ['3'],
    notes: ['', [Validators.maxLength(2000)]],
  });

  /** Register number, brand and cover belong to an implant; an extraction has a tooth and a date. */
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
   * derived. Delete with apps/api/src/modules/surgery/legacy-prosthesis-due.ts.
   */
  private readonly legacyProsthesisDue = signal<string | null>(null);

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

  /**
   * Implant-register cases whose recorded name matches what's been typed so
   * far. `switchMap` drops the response to an earlier, slower query, so a
   * result for "Ali" cannot land after — and replace — the one for "Alireza".
   */
  private readonly implantMatches = toSignal(
    this.form.controls.recordedName.valueChanges.pipe(
      debounceTime(300),
      map((v) => v.trim()),
      distinctUntilChanged(),
      switchMap((q) =>
        q.length < 2
          ? of<RegistryCase[]>([])
          : this.registry.implants({ q, page: 1, limit: 8 }).pipe(
              map((result) => result.items),
              catchError(() => of<RegistryCase[]>([])),
            ),
      ),
    ),
    { initialValue: [] as RegistryCase[] },
  );
  protected readonly nameOptions = computed<TextFieldOption[]>(() =>
    this.implantMatches().map((c) => ({ value: c.recordedName, label: c.recordedName, meta: c.registryNo })),
  );

  constructor() {
    warnBeforeUnload(() => this.hasUnsavedChanges());
    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.loadSurgery(id) : this.prefillNew()));
    });
  }

  /**
   * Switching kind resets what the other kind does not have, and offers that
   * kind's usual follow-up — only on a new row, where nothing has been
   * decided yet; editing keeps whatever was recorded.
   */
  protected onKindChange(kind: SurgeryKind): void {
    this.form.controls.kind.setValue(kind);
    if (this.isEdit()) return;
    this.form.controls.followUpMonths.setValue(kind === 'implant' ? '3' : '2');
    if (kind === 'extraction') {
      this.form.patchValue({ implantRegistryNo: '', implantBrand: '', abutmentType: 'unknown' });
    } else {
      this.prefillNew();
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
        void this.router.navigate(['/surgery']);
      },
    });
  }

  private applyItem(item: SurgeryQueueItem): void {
    this.form.patchValue({
      kind: item.kind,
      recordedName: item.recordedName,
      implantRegistryNo: item.implantRegistryNo ?? '',
      surgeryDate: this.toDate(item.surgeryDate?.jalali),
      toothPosition: item.toothPosition,
      implantBrand: item.implantBrand ?? '',
      abutmentType: item.abutmentType,
      followUpMonths: item.followUpMonths ? String(item.followUpMonths) : '',
      notes: item.notes ?? '',
    });
    this.legacyProsthesisDue.set(item.prosthesisDue);
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
   * Picking a name from the implant register is how a row gets linked to the
   * right case — its registry number is what the API actually matches on, so
   * filling it in here is what makes the link real rather than just cosmetic.
   */
  protected onNameSelected(option: TextFieldOption): void {
    if (option.meta) this.form.controls.implantRegistryNo.setValue(String(option.meta));
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
      kind: raw.kind,
      recordedName: raw.recordedName.trim(),
      toothPosition: blank(raw.toothPosition) ?? '',
      // An extraction carries none of the implant fields; clear them so a row
      // whose kind was corrected does not keep a stale number or brand.
      implantRegistryNo: implant ? identifierValue(raw.implantRegistryNo) : null,
      implantBrand: implant ? raw.implantBrand || null : null,
      abutmentType: implant ? raw.abutmentType : 'unknown',
      followUpMonths: raw.followUpMonths ? Number(raw.followUpMonths) : null,
      notes: blank(raw.notes),
    };
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
