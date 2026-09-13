import type { Patient, PatientInput } from './data/patient.model';

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

/**
 * Which editable fields differ between two versions of a record — the list a
 * conflict message shows so the user knows what someone else changed under
 * them. Keys are `fieldLabel()` keys.
 */
export function changedPatientFields(before: Patient, after: Patient): string[] {
  const view = (p: Patient): Record<string, string | null> => ({
    fileNo: p.fileNo,
    firstName: p.firstName,
    lastName: p.lastName,
    fatherName: p.fatherName,
    nationalId: p.nationalId,
    gender: p.gender,
    mobile: p.mobile,
    homePhone: p.homePhone,
    birthDate: p.birthDate?.jalali ?? null,
    occupation: p.occupation,
    education: p.education,
    referralSourceName: p.referralSource?.name ?? null,
    medicalHistory: p.medicalHistory,
    homeAddress: p.homeAddress,
    workAddress: p.workAddress,
    firstVisitAt: p.firstVisitAt?.jalali ?? null,
    lastVisitAt: p.lastVisitAt?.jalali ?? null,
    notes: p.notes,
    treatments: [...p.treatments.map((t) => t.code)].sort().join(','),
    isArchived: String(p.isArchived),
  });
  const a = view(before);
  const b = view(after);
  return Object.keys(a).filter((key) => a[key] !== b[key]);
}
