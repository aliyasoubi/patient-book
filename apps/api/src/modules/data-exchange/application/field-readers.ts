import { Patient } from '../../patients/patient.entity';

/** The registry-case shape both the implant and ortho books share. */
export interface RegistryLike {
  id: string;
  registryNo: string;
  recordedName: string;
  mobile: string | null;
  homePhone: string | null;
}

/**
 * How to read the app's *current* value for every field reconcile may write.
 *
 * Deliberately one map rather than a list in the preview and another lookup in
 * the apply step: the two must agree exactly, because apply compares what it
 * reads here against the `expectedCurrent` the preview reported. If the two
 * sides could drift, stale-write protection would silently start passing on a
 * value it never really checked.
 *
 * Jalali dates read as their raw text — the same form `UpdatePatientDto`
 * accepts back, so a value can round-trip without being reformatted.
 */
export const PATIENT_FIELD_READERS: Readonly<
  Record<string, (p: Patient) => string | null>
> = {
  firstName: (p) => p.firstName || null,
  lastName: (p) => p.lastName || null,
  fatherName: (p) => p.fatherName,
  nationalId: (p) => p.nationalId,
  gender: (p) => p.gender,
  mobile: (p) => p.mobile,
  homePhone: (p) => p.homePhone,
  occupation: (p) => p.occupation,
  education: (p) => p.education,
  medicalHistory: (p) => p.medicalHistory,
  homeAddress: (p) => p.homeAddress,
  workAddress: (p) => p.workAddress,
  birthDate: (p) => p.birthDateRaw,
  firstVisitAt: (p) => p.firstVisitRaw,
  lastVisitAt: (p) => p.lastVisitRaw,
  referralSourceName: (p) => p.referralSource?.name ?? null,
};

export const REGISTRY_FIELD_READERS: Readonly<
  Record<string, (c: RegistryLike) => string | null>
> = {
  recordedName: (c) => c.recordedName || null,
  mobile: (c) => c.mobile,
  homePhone: (c) => c.homePhone,
};

/**
 * Treatment columns are intentionally absent from both maps: treatments have
 * their own in-app edit path, and letting a spreadsheet be a second authority
 * over them would silently revert work staff did after the migration.
 */
export const PATIENT_FIELDS = Object.keys(PATIENT_FIELD_READERS);
export const REGISTRY_FIELDS = Object.keys(REGISTRY_FIELD_READERS);
