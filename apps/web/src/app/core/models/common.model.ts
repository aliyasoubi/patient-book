/** Wire type mirroring the API. Dates arrive as Jalali strings plus an ISO value. */
export interface JalaliValue {
  /** `1368/05/12`, already trimmed to the precision actually known. */
  jalali: string;
  iso: string;
  precision: 'day' | 'month' | 'year';
  /** The original spreadsheet text, when the import could not parse it cleanly. */
  raw?: string | null;
}

export type Gender = 'male' | 'female' | 'unknown';

export type EducationLevel =
  | 'none' | 'primary' | 'diploma' | 'associate' | 'bachelor'
  | 'master' | 'doctorate' | 'student' | 'other' | 'unknown';

export interface PatientTreatment {
  id: string;
  code: string;
  nameFa: string;
  nameEn: string;
  icon: string;
  color: string;
  performedAt: JalaliValue | null;
  notes: string | null;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  errors?: string[];
  path: string;
  timestamp: string;
}

export type UserRole = 'admin' | 'dentist' | 'receptionist' | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface RegistryCase {
  id: string;
  registryNo: string;
  patientId: string | null;
  patient: { id: string; fileNo: string; firstName: string; lastName: string } | null;
  recordedName: string;
  matchMethod: 'exact' | 'fuzzy' | 'manual' | 'unmatched';
  mobile: string | null;
  homePhone: string | null;
  status: 'active' | 'completed' | 'on_hold';
  notes: string | null;
}

export type SurgeryKind = 'implant' | 'extraction';

export interface SurgeryQueueItem {
  id: string;
  kind: SurgeryKind;
  implantCaseId: string | null;
  implantRegistryNo: string | null;
  recordedName: string;
  /** True when the register number has been reused for a different person. */
  hasNameMismatch: boolean;
  registeredName: string | null;
  patient: { id: string; fileNo: string; fullName: string; mobile: string | null } | null;
  surgeryDate: { jalali: string; iso: string; precision: string; raw?: string | null } | null;
  toothPosition: string;
  implantBrand: string | null;
  abutmentType: 'cover' | 'healing' | 'both' | 'other' | 'unknown';
  abutmentRaw: string | null;
  /** Legacy free text ("آذر ماه") from the import; new rows use the fields below. */
  prosthesisDue: string | null;
  /** Months after the surgery the follow-up is due; the API derives the date. */
  followUpMonths: number | null;
  followUpDate: { jalali: string; iso: string } | null;
  followUpDoneAt: string | null;
  followUpState: FollowUpState;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
}

/** Judged by the API against the current Jalali month. */
export type FollowUpState = 'none' | 'pending' | 'due' | 'overdue' | 'done';

/** The list's follow-up windows; the API owns what each means in dates. */
export type FollowUpFilter = 'pending' | 'week' | 'thisMonth' | 'nextMonth' | 'overdue';

/** A row for the dashboard's follow-up panel — already formatted, not the full queue record. */
export interface FollowUpDue {
  id: string;
  recordedName: string;
  implantRegistryNo: string | null;
  patientId: string | null;
  mobile: string | null;
  followUpDate: string | null;
  followUpState: FollowUpState;
  hasNameMismatch: boolean;
}

export interface DashboardStats {
  totals: {
    patients: number;
    archived: number;
    implantCases: number;
    orthoCases: number;
    followUpsThisWeek: number;
    followUpsOverdue: number;
    needsReview: number;
  };
  gender: { key: string; count: number }[];
  topTreatments: {
    code: string;
    nameFa: string;
    icon: string;
    color: string;
    count: number;
  }[];
  topReferrals: { id: string; name: string; kind: string; count: number }[];
  newPatientsByMonth: { month: string; count: number }[];
  ageBands: { band: string; count: number }[];
  recentlyActive: number;
  inactiveOverYear: number;
}


export interface AuditEntry {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: Record<string, { from?: unknown; to?: unknown } | unknown> | null;
  createdAt: string;
}
