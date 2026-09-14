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

export interface SurgeryQueueItem {
  id: string;
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
  prosthesisDue: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
}

/** A row for the dashboard's "next up" panel — already formatted, not the full queue record. */
export interface UpcomingSurgery {
  id: string;
  recordedName: string;
  toothPosition: string;
  implantBrand: string | null;
  hasNameMismatch: boolean;
  surgeryDate: string | null;
}

export interface DashboardStats {
  totals: {
    patients: number;
    archived: number;
    implantCases: number;
    orthoCases: number;
    upcomingSurgeries: number;
    overdueSurgeries: number;
    needsReview: number;
  };
  gender: Array<{ key: string; count: number }>;
  topTreatments: Array<{
    code: string;
    nameFa: string;
    icon: string;
    color: string;
    count: number;
  }>;
  topReferrals: Array<{ id: string; name: string; kind: string; count: number }>;
  newPatientsByMonth: Array<{ month: string; count: number }>;
  ageBands: Array<{ band: string; count: number }>;
  recentlyActive: number;
  inactiveOverYear: number;
}

/** One field a reconcile preview proposes changing, with the current value. */
export interface FieldDiff {
  field: string;
  current: string | null;
  proposed: string | null;
}

export interface PatientDiff {
  id: string;
  fileNo: string;
  fullName: string;
  fields: FieldDiff[];
}

export interface CaseDiff {
  id: string;
  registryNo: string;
  recordedName: string;
  fields: FieldDiff[];
}

export interface ReconcilePreview {
  patients: PatientDiff[];
  implants: CaseDiff[];
  ortho: CaseDiff[];
  /** Sheet rows that found their record, whether or not anything differed. */
  matched: { patients: number; implants: number; ortho: number };
  /** Sheet rows with no matching fileNo/registryNo in the app. */
  unmatched: { patients: number; implants: number; ortho: number };
}

/**
 * Per-row outcome of an apply. A failure carries the same stable code the rest
 * of the API speaks, so `ApiErrorTranslator` renders a real reason.
 */
export interface ApplyResultRow {
  id: string;
  ok: boolean;
  code?: string;
  params?: Readonly<Record<string, string | number>>;
}

export interface ApplyReconcileResult {
  patients: ApplyResultRow[];
  implants: ApplyResultRow[];
  ortho: ApplyResultRow[];
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
