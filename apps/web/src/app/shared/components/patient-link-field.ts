import { Component, Signal, computed, inject, input, model } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { PatientsService } from '../../features/patients/data/patients.service';
import type { PatientSuggestion } from '../../features/patients/data/patient.model';
import { PbTextField } from '../ui';
import type { TextFieldOption } from '../ui';

/** A patient in the main book, as a link shows it. */
export interface LinkedPatient {
  id: string;
  fileNo: string;
  fullName: string;
}

const MIN_PATIENT_QUERY = 2;

/**
 * Links a record to a patient in the main book. Typing searches; picking
 * links; the chip's cross unlinks. Text left in the box without a pick
 * changes nothing, so a half-typed search cannot silently drop a link.
 *
 * `linked` is two-way: it starts as whatever the record holds and is what
 * the caller saves.
 */
@Component({
  selector: 'pb-patient-link-field',
  standalone: true,
  imports: [MatIconModule, PbTextField, TranslatePipe],
  template: `
    <pb-text-field
      [control]="search"
      [label]="label()"
      [hint]="hint() ?? defaultHint()"
      prefixIcon="person_search"
      [options]="options()"
      (optionSelected)="onSelected($event)"
    />
    @if (linked(); as patient) {
      <div class="link">
        <mat-icon aria-hidden="true">link</mat-icon>
        <span
          >{{ patient.fullName }} —
          {{ 'registry.patientFile' | translate: { fileNo: patient.fileNo } }}</span
        >
        <button
          type="button"
          class="link__remove"
          (click)="unlink()"
          [attr.aria-label]="'registryForm.unlink' | translate"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .link {
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
    .link__remove {
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
export class PbPatientLinkField {
  private readonly patients = inject(PatientsService);
  private readonly i18n = inject(TranslateService);

  readonly label = input.required<string>();
  /** Replaces the default "type to search" / "linked" hint when set. */
  readonly hint = input<string | null>(null);
  readonly linked = model<LinkedPatient | null>(null);

  protected readonly search = new FormControl('', { nonNullable: true });

  /** Type-ahead over the main book; `switchMap` drops a stale response. */
  private readonly matches: Signal<PatientSuggestion[]> = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(250),
      map((v) => v.trim()),
      distinctUntilChanged(),
      switchMap((q) => {
        // Picking an option writes its value — the id — into the box before
        // `optionSelected` swaps in the name. That echo is a pick, not a query.
        const current = this.matches();
        if (current.some((p) => p.id === q)) return of(current);
        if (q.length < MIN_PATIENT_QUERY) return of<PatientSuggestion[]>([]);
        return this.patients.suggest(q).pipe(catchError(() => of<PatientSuggestion[]>([])));
      }),
    ),
    { initialValue: [] as PatientSuggestion[] },
  );

  protected readonly options = computed<TextFieldOption[]>(() => {
    this.i18n.currentLang();
    return this.matches().map((p) => ({
      value: p.id,
      label: p.fullName || this.i18n.instant('patient.unnamed'),
      meta: this.i18n.instant('registry.patientFile', { fileNo: p.fileNo }),
    }));
  });

  protected readonly defaultHint = computed(() => {
    this.i18n.currentLang();
    return this.i18n.instant(
      this.linked() ? 'registryForm.patientLinkHintLinked' : 'registryForm.patientLinkHint',
    );
  });

  protected onSelected(option: TextFieldOption): void {
    const match = this.matches().find((p) => p.id === option.value);
    if (!match) return;
    this.linked.set({ id: match.id, fileNo: match.fileNo, fullName: match.fullName });
    // The box shows the choice rather than the id the option carries.
    this.search.setValue(match.fullName, { emitEvent: false });
  }

  protected unlink(): void {
    this.linked.set(null);
    this.search.setValue('', { emitEvent: false });
  }
}
