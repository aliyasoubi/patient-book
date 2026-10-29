import { TestBed } from '@angular/core/testing';
import type { FormGroup } from '@angular/forms';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { JALALI_DATE_FORMATS, JalaliDateAdapter } from '../../core/jalali/jalali-date-adapter';
import { AuthService } from '../../core/services/auth.service';
import { ListReturn } from '../../core/services/list-return.service';
import { RegistryService } from '../../core/services/registry.service';
import { PatientsService } from '../patients/data/patients.service';
import type { PatientSuggestion } from '../patients/data/patient.model';
import { SurgeryForm } from './surgery-form';

const withFile: PatientSuggestion = {
  id: 'patient-a',
  fileNo: '101',
  fullName: 'بیمار اول',
  mobile: '09120000001',
  match: null,
};
const withoutFile: PatientSuggestion = {
  id: 'patient-b',
  fileNo: '102',
  fullName: 'بیمار دوم',
  mobile: null,
  match: null,
};

function open() {
  const saveSurgery = vi.fn(() => of({}));
  TestBed.configureTestingModule({
    imports: [SurgeryForm],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      provideTranslateService(),
      { provide: MAT_DATE_LOCALE, useValue: 'fa-IR' },
      { provide: DateAdapter, useClass: JalaliDateAdapter },
      { provide: MAT_DATE_FORMATS, useValue: JALALI_DATE_FORMATS },
      { provide: AuthService, useValue: { can: () => true } },
      { provide: ListReturn, useValue: { urlFor: (path: string) => path } },
      {
        provide: RegistryService,
        useValue: { nextRegistryNo: () => of({ registryNo: '500' }), saveSurgery },
      },
      {
        provide: PatientsService,
        useValue: {
          suggest: () => of([withFile, withoutFile]),
          // Only the first patient has an implant file.
          get: (id: string) =>
            of({
              id,
              implantCases: id === withFile.id ? [{ id: 'case-a', registryNo: '77' }] : [],
            }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SurgeryForm);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const form = (fixture.componentInstance as unknown as { form: FormGroup }).form;
  const registryNo = () => form.controls['implantRegistryNo'].value as string;

  /** Search the patient book and pick the patient from the panel, as staff do. */
  const pick = async (patient: PatientSuggestion) => {
    const input = root.querySelector<HTMLInputElement>('input[aria-autocomplete]')!;
    input.value = 'بیمار';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.debugElement
      .query(By.directive(MatAutocompleteTrigger))
      .injector.get(MatAutocompleteTrigger)
      .openPanel();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = fixture.debugElement
      .query(By.directive(MatAutocomplete))
      .injector.get(MatAutocomplete);
    panel.options.toArray()[[withFile, withoutFile].indexOf(patient)]._selectViaInteraction();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const save = () => {
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    fixture.detectChanges();
  };
  return { pick, save, registryNo, saveSurgery };
}

describe('SurgeryForm patient and implant file', () => {
  it('puts a new implant row in the picked patient’s implant file', async () => {
    const { pick, registryNo } = open();
    expect(registryNo()).toBe('500');
    await pick(withFile);
    expect(registryNo()).toBe('77');
  });

  it('gives the first patient’s file number back when another patient is picked', async () => {
    const { pick, save, registryNo, saveSurgery } = open();
    await pick(withFile);
    await pick(withoutFile);

    // The second patient has no file: the book's next number, not the first's.
    expect(registryNo()).toBe('500');
    save();
    expect(saveSurgery).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ patientId: withoutFile.id, implantRegistryNo: '500' }),
    );
  });
});
