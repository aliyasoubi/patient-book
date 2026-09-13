import { Patient } from './patient.entity';
import { JalaliDate } from '../../domain';
import type { DatePrecision } from '../../domain';

/**
 * Wire shape for a patient. Dates cross the wire as **Jalali strings** — the
 * calendar the practice actually works in — alongside the ISO value for any
 * client that wants to sort or compute on it.
 */
export interface PatientResponse {
  id: string;
  fileNo: string;
  firstName: string;
  lastName: string;
  fullName: string;
  fatherName: string | null;
  nationalId: string | null;
  gender: string;
  mobile: string | null;
  homePhone: string | null;
  birthDate: JalaliValue | null;
  age: number | null;
  occupation: string | null;
  education: string;
  educationRaw: string | null;
  referralSource: { id: string; name: string; kind: string } | null;
  medicalHistory: string | null;
  homeAddress: string | null;
  workAddress: string | null;
  firstVisitAt: JalaliValue | null;
  lastVisitAt: JalaliValue | null;
  notes: string | null;
  treatments: Array<{
    id: string;
    code: string;
    nameFa: string;
    nameEn: string;
    icon: string;
    color: string;
    performedAt: JalaliValue | null;
    notes: string | null;
  }>;
  implantCases?: Array<{ id: string; registryNo: string; status: string }>;
  orthoCases?: Array<{ id: string; registryNo: string; status: string }>;
  dataIssues: Patient['dataIssues'];
  isImported: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency token; send back as `expectedVersion` on update. */
  version: number;
}

export interface JalaliValue {
  /** `1368/05/12`, trimmed to the precision actually known. */
  jalali: string;
  iso: string;
  precision: DatePrecision;
  /** The original spreadsheet text, when it differs from the parsed value. */
  raw?: string | null;
}

/**
 * Render a stored date for the wire. Both calendars go out: the Jalali string
 * the practice reads, and the ISO value a client can sort or compute on.
 */
function jalali(
  date: Date | string | null,
  precision: string | null,
  raw?: string | null,
): JalaliValue | null {
  if (!date) return null;
  const value = JalaliDate.fromDate(
    date instanceof Date ? date : new Date(date),
    (precision as DatePrecision) ?? 'day',
  );
  if (!value) return null;
  return {
    jalali: value.format(),
    iso: value.toIsoDate(),
    precision: value.precision,
    ...(raw ? { raw } : {}),
  };
}

export function toPatientResponse(p: Patient, detailed = false): PatientResponse {
  const birth = jalali(p.birthDate, p.birthDatePrecision, p.birthDateRaw);
  const response: PatientResponse = {
    id: p.id,
    fileNo: p.fileNo,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
    fatherName: p.fatherName,
    nationalId: p.nationalId,
    gender: p.gender,
    mobile: p.mobile,
    homePhone: p.homePhone,
    birthDate: birth,
    age: birth ? (JalaliDate.fromDate(new Date(p.birthDate!))?.ageInYears() ?? null) : null,
    occupation: p.occupation,
    education: p.education,
    educationRaw: p.educationRaw,
    referralSource: p.referralSource
      ? { id: p.referralSource.id, name: p.referralSource.name, kind: p.referralSource.kind }
      : null,
    medicalHistory: p.medicalHistory,
    homeAddress: p.homeAddress,
    workAddress: p.workAddress,
    firstVisitAt: jalali(p.firstVisitAt, 'day', p.firstVisitRaw),
    lastVisitAt: jalali(p.lastVisitAt, 'day', p.lastVisitRaw),
    notes: p.notes,
    treatments: (p.treatments ?? []).map((t) => ({
      id: t.id,
      code: t.treatmentType?.code ?? '',
      nameFa: t.treatmentType?.nameFa ?? '',
      nameEn: t.treatmentType?.nameEn ?? '',
      icon: t.treatmentType?.icon ?? 'dentistry',
      color: t.treatmentType?.color ?? 'primary',
      performedAt: jalali(t.performedAt, 'day', t.performedAtRaw),
      notes: t.notes,
    })),
    dataIssues: p.dataIssues ?? [],
    isImported: p.isImported,
    isArchived: p.deletedAt !== null,
    createdAt: p.createdAt?.toISOString() ?? '',
    updatedAt: p.updatedAt?.toISOString() ?? '',
    version: p.version,
  };

  if (detailed) {
    response.implantCases = (p.implantCases ?? []).map((c) => ({
      id: c.id,
      registryNo: c.registryNo,
      status: c.status,
    }));
    response.orthoCases = (p.orthoCases ?? []).map((c) => ({
      id: c.id,
      registryNo: c.registryNo,
      status: c.status,
    }));
  }
  return response;
}
