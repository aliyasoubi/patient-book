import { describe, expect, it } from 'vitest';

import type { Patient, PatientInput } from './data/patient.model';
import {
  applyPatientDateChanges,
  changedPatientFields,
  type PatientDateControlState,
} from './patient-form.utils';

const basePayload = (): PatientInput => ({
  fileNo: '12',
  firstName: 'مریم',
  lastName: 'کریمی',
});

const state = (
  birthDate: PatientDateControlState,
  firstVisitAt: PatientDateControlState = { value: null, dirty: false },
  lastVisitAt: PatientDateControlState = { value: null, dirty: false },
) => ({ birthDate, firstVisitAt, lastVisitAt });

describe('applyPatientDateChanges', () => {
  it('omits a pristine empty edit field so an imprecise imported date survives', () => {
    const payload = basePayload();

    applyPatientDateChanges(payload, true, state({ value: null, dirty: false }), () => 'unused');

    expect(payload).not.toHaveProperty('birthDate');
  });

  it('sends null only when the user explicitly clears an edit field', () => {
    const payload = basePayload();

    applyPatientDateChanges(payload, true, state({ value: null, dirty: true }), () => 'unused');

    expect(payload.birthDate).toBeNull();
  });

  it('serializes a date selected by the user', () => {
    const payload = basePayload();
    const selected = new Date(2026, 7, 27);

    applyPatientDateChanges(payload, true, state({ value: selected, dirty: true }), (value) =>
      value === selected ? '1405/06/05' : 'unexpected',
    );

    expect(payload.birthDate).toBe('1405/06/05');
  });
});

describe('changedPatientFields', () => {
  const record = (overrides: Partial<Patient> = {}): Patient =>
    ({
      id: 'p1',
      fileNo: '12',
      firstName: 'مریم',
      lastName: 'کریمی',
      fullName: 'مریم کریمی',
      fatherName: null,
      nationalId: null,
      gender: 'female',
      mobile: '09121234567',
      homePhone: null,
      birthDate: { jalali: '1368/01/01', iso: '1989-03-21', precision: 'day' },
      age: 36,
      occupation: null,
      education: 'unknown',
      educationRaw: null,
      referralSource: null,
      medicalHistory: null,
      homeAddress: null,
      workAddress: null,
      firstVisitAt: null,
      lastVisitAt: null,
      notes: null,
      treatments: [],
      dataIssues: [],
      isImported: false,
      isArchived: false,
      createdAt: '',
      updatedAt: '',
      version: 1,
      ...overrides,
    }) as Patient;

  it('reports nothing for an identical record', () => {
    expect(changedPatientFields(record(), record({ version: 2 }))).toEqual([]);
  });

  it('names the fields another user changed, treatments included', () => {
    const after = record({
      mobile: '09120000000',
      medicalHistory: 'دیابت',
      treatments: [{ id: 't', code: 'scaling' } as Patient['treatments'][number]],
    });
    expect(changedPatientFields(record(), after)).toEqual([
      'mobile',
      'medicalHistory',
      'treatments',
    ]);
  });
});
