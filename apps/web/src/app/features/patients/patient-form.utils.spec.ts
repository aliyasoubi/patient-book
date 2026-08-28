import { describe, expect, it } from 'vitest';

import type { PatientInput } from './data/patient.model';
import { applyPatientDateChanges, type PatientDateControlState } from './patient-form.utils';

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
