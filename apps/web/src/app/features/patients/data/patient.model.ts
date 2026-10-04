import type { ApiErrorCode, ApiErrorParams } from '../../../core/i18n/api-error-code';
import type { EducationLevel, Gender, JalaliValue, PatientTreatment } from '../../../core/models/common.model';

/** Wire types mirroring the API. Dates arrive as Jalali strings plus an ISO value. */

/**
 * Something about a record a human should check.
 *
 * The API sends a stable code plus its parameters rather than a sentence, so
 * the wording lives in `ApiErrorTranslator` and follows the reader's language.
 */
export interface DataIssue {
  field: string;
  /** Absent on flags saved before issues carried codes; see `message`. */
  code?: ApiErrorCode | string;
  params?: ApiErrorParams;
  /** The importer's own Persian sentence, on those older flags only. */
  message?: string;
  /** Exactly what the source said. */
  rawValue?: string;
  severity: 'warning' | 'error';
}

export interface ReferralSourceRef {
  id: string;
  name: string;
  kind: string;
}

export interface Patient {
  id: string;
  fileNo: string;
  firstName: string;
  lastName: string;
  fullName: string;
  fatherName: string | null;
  nationalId: string | null;
  gender: Gender;
  mobile: string | null;
  homePhone: string | null;
  birthDate: JalaliValue | null;
  age: number | null;
  occupation: string | null;
  education: EducationLevel;
  educationRaw: string | null;
  referralSource: ReferralSourceRef | null;
  medicalHistory: string | null;
  homeAddress: string | null;
  workAddress: string | null;
  firstVisitAt: JalaliValue | null;
  lastVisitAt: JalaliValue | null;
  notes: string | null;
  treatments: PatientTreatment[];
  implantCases?: RegistryRef[];
  orthoCases?: RegistryRef[];
  dataIssues: DataIssue[];
  isImported: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency token; sent back as `expectedVersion` on update. */
  version: number;
}

export interface RegistryRef {
  id: string;
  registryNo: string;
  status: string;
}

export interface PatientSuggestion {
  id: string;
  fileNo: string;
  fullName: string;
  mobile: string | null;
  /** Set when the typed number is this patient's own file, national id or mobile. */
  match: 'fileNo' | 'nationalId' | 'mobile' | null;
}

/** Why an existing record may be the person being registered. */
export type DuplicateReason = 'nationalId' | 'name' | 'mobile';

/** An existing record the registration form points the user to. */
export interface PossibleDuplicate {
  id: string;
  fileNo: string;
  fullName: string;
  fatherName: string | null;
  archived: boolean;
  /** Strongest first. */
  reasons: DuplicateReason[];
}

/** What the registration form has typed so far; every field optional. */
export interface DuplicateQuery {
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  nationalId?: string;
  mobile?: string;
}

/** A distinct first/last-name spelling on file, folded to collapse visual duplicates. */
export interface NameSuggestion {
  name: string;
  count: number;
}

export interface TreatmentType {
  id: string;
  code: string;
  nameFa: string;
  nameEn: string;
  icon: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ReferralSource extends ReferralSourceRef {
  normalizedName: string;
  isActive: boolean;
  patientCount?: number;
}

/** Payload for create/update. Dates go up as Jalali strings. */
export interface PatientInput {
  fileNo: string;
  firstName: string;
  lastName: string;
  fatherName?: string | null;
  nationalId?: string | null;
  gender?: Gender;
  mobile?: string | null;
  homePhone?: string | null;
  birthDate?: string | null;
  occupation?: string | null;
  education?: EducationLevel;
  referralSourceId?: string | null;
  referralSourceName?: string | null;
  medicalHistory?: string | null;
  homeAddress?: string | null;
  workAddress?: string | null;
  firstVisitAt?: string | null;
  lastVisitAt?: string | null;
  notes?: string | null;
  treatments?: { code: string; performedAt?: string | null; notes?: string | null }[];
}
