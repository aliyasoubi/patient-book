import type { PatientInput } from './data/patient.model';

export type PatientDateKey = 'birthDate' | 'firstVisitAt' | 'lastVisitAt';

export interface PatientDateControlState {
  value: Date | null;
  dirty: boolean;
}

const PATIENT_DATE_KEYS: PatientDateKey[] = ['birthDate', 'firstVisitAt', 'lastVisitAt'];

/**
 * Add dates to a save payload without destroying imprecise imported values.
 *
 * An edit only owns a date after its control becomes dirty. A pristine empty
 * datepicker can represent an imported year/month value, not a request to
 * clear it. On create, empty dates are simply omitted.
 */
export function applyPatientDateChanges(
  payload: PatientInput,
  isEdit: boolean,
  controls: Record<PatientDateKey, PatientDateControlState>,
  serialize: (value: Date) => string,
): void {
  for (const key of PATIENT_DATE_KEYS) {
    const control = controls[key];
    if (isEdit && !control.dirty) continue;
    if (control.value) payload[key] = serialize(control.value);
    else if (isEdit) payload[key] = null;
  }
}
