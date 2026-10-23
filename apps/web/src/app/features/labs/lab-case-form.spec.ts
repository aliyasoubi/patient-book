import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { type Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { JALALI_DATE_FORMATS, JalaliDateAdapter } from '../../core/jalali/jalali-date-adapter';
import type { LabCase } from '../../core/models/common.model';
import { LabService } from '../../core/services/lab.service';
import { ListReturn } from '../../core/services/list-return.service';
import { PatientsService } from '../patients/data/patients.service';
import type { PatientSuggestion } from '../patients/data/patient.model';
import { LabCaseForm } from './lab-case-form';

const first: PatientSuggestion = {
  id: 'patient-a',
  fileNo: '101',
  fullName: 'بیمار اول',
  mobile: null,
  match: null,
};
const second: PatientSuggestion = {
  id: 'patient-b',
  fileNo: '102',
  fullName: 'بیمار دوم',
  mobile: null,
  match: null,
};

/** A case linked to the first patient, written down under another spelling of their name. */
const saved = (over: Partial<LabCase> = {}): LabCase => ({
  id: 'case-1',
  patientId: first.id,
  patient: { id: first.id, fileNo: first.fileNo, fullName: first.fullName, mobile: null },
  recordedName: 'بیمار اوّل',
  lab: { id: 'lab-1', name: 'لابراتوار', isActive: true },
  workTypes: ['crown'],
  jaw: null,
  teethFdi: [11],
  toothWork: [{ tooth: 11, workType: 'crown' }],
  toothCount: 1,
  teeth: '',
  implantBrand: null,
  impressionCount: null,
  analogCount: null,
  partsReturnedAt: null,
  appointmentAt: null,
  appointmentTimeliness: null,
  appointmentDays: null,
  partsOutstanding: false,
  partsDueAt: null,
  partsTimeliness: null,
  partsDaysLate: 0,
  deliveredAt: null,
  stage: 'at_lab',
  since: null,
  daysInStage: null,
  timeliness: null,
  daysLate: 0,
  trips: [
    {
      id: 'trip-1',
      sequence: 1,
      kind: 'impression',
      sentAt: '1405/07/01',
      waitDays: 7,
      expectedAt: '1405/07/08',
      receivedAt: null,
      note: null,
    },
  ],
  notes: null,
  isArchived: false,
  version: 3,
  ...over,
});

interface View {
  setToothWork(work: { tooth: number; workType: string }[]): void;
  submit(): void;
}

function open(id?: string, update?: () => Observable<LabCase>) {
  const labs = {
    labs: () => of([{ id: 'lab-1', name: 'لابراتوار', isActive: true }]),
    get: vi.fn(() => of(saved())),
    create: vi.fn(() => of(saved())),
    update: vi.fn(update ?? (() => of(saved()))),
  };
  TestBed.configureTestingModule({
    imports: [LabCaseForm],
    providers: [
      // Saving goes back to the list; any route will do.
      provideRouter([{ path: '**', children: [] }]),
      provideTranslateService(),
      { provide: MAT_DATE_LOCALE, useValue: 'fa-IR' },
      { provide: DateAdapter, useClass: JalaliDateAdapter },
      { provide: MAT_DATE_FORMATS, useValue: JALALI_DATE_FORMATS },
      { provide: LabService, useValue: labs },
      { provide: PatientsService, useValue: { suggest: () => of([first, second]) } },
      { provide: ListReturn, useValue: { urlFor: (path: string) => path } },
    ],
  });
  const fixture = TestBed.createComponent(LabCaseForm);
  if (id) fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  const view = fixture.componentInstance as unknown as View;
  const root = fixture.nativeElement as HTMLElement;
  const nameInput = () => root.querySelector<HTMLInputElement>('input[aria-autocomplete]')!;

  /** A keystroke in the patient field, then the search's debounce. */
  const type = async (text: string) => {
    const input = nameInput();
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** Search for the patient and pick them from the panel, as staff do. */
  const pick = async (patient: PatientSuggestion) => {
    await type('بیمار');
    fixture.debugElement
      .query(By.directive(MatAutocompleteTrigger))
      .injector.get(MatAutocompleteTrigger)
      .openPanel();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = fixture.debugElement
      .query(By.directive(MatAutocomplete))
      .injector.get(MatAutocomplete);
    const index = [first, second].indexOf(patient);
    panel.options.toArray()[index]._selectViaInteraction();
    fixture.detectChanges();
  };

  const save = () => {
    // A new case needs its work; an edit already has it.
    if (!id) view.setToothWork([{ tooth: 11, workType: 'crown' }]);
    view.submit();
    fixture.detectChanges();
  };

  const linkedText = () => root.querySelector('.form__linked')?.textContent ?? null;
  return { labs, type, pick, save, linkedText, fixture };
}

describe('LabCaseForm patient link', () => {
  it('does not save a case under one patient with another one’s name', async () => {
    const { labs, type, pick, save, linkedText } = open();
    await pick(first);
    expect(linkedText()).toContain(first.fullName);

    await type(second.fullName);
    save();

    expect(linkedText()).toBeNull();
    expect(labs.create).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: null, recordedName: second.fullName }),
    );
  });

  it('saves the patient picked last', async () => {
    const { labs, pick, save, linkedText } = open();
    await pick(first);
    await pick(second);
    save();

    expect(linkedText()).toContain(second.fullName);
    expect(labs.create).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: second.id, recordedName: second.fullName }),
    );
  });

  it('keeps the link of a case saved under another spelling, left as it was', async () => {
    const { labs, save, linkedText } = open('case-1');
    save();

    expect(linkedText()).toContain(first.fullName);
    expect(labs.update).toHaveBeenCalledWith(
      'case-1',
      expect.objectContaining({
        patientId: first.id,
        recordedName: 'بیمار اوّل',
        expectedVersion: 3,
      }),
    );
  });

  it('does not link back, after a conflict, a patient typed over', async () => {
    let calls = 0;
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { code: 'ERR_LAB_CASE_MODIFIED' },
    });
    const { labs, type, save, fixture } = open('case-1', () =>
      calls++ === 0 ? throwError(() => conflict) : of(saved()),
    );
    await type(second.fullName);
    // Someone else saved meanwhile; the case is still linked to the first patient.
    labs.get.mockReturnValue(of(saved({ version: 4 })));
    save();
    await fixture.whenStable();
    save();

    expect(labs.update).toHaveBeenLastCalledWith(
      'case-1',
      expect.objectContaining({
        patientId: null,
        recordedName: second.fullName,
        expectedVersion: 4,
      }),
    );
  });
});
