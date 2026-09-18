export enum UserRole {
  /** Full access, including user management and permanent deletion. */
  Admin = 'admin',
  /** Clinical staff: full patient read/write, no user management. */
  Dentist = 'dentist',
  /** Front desk: patient read/write, no deletion, no clinical notes edit. */
  Receptionist = 'receptionist',
  /** Read-only, for accountants or temporary staff. */
  Viewer = 'viewer',
}

export enum Gender {
  Male = 'male',
  Female = 'female',
  Unknown = 'unknown',
}

/**
 * Education levels, folded from the free text in the source sheets where
 * لیسانس/کارشناسی and فوق‌لیسانس/کارشناسی ارشد/ارشد are the same degree written
 * three different ways.
 */
export enum EducationLevel {
  None = 'none',
  Primary = 'primary',
  Diploma = 'diploma',
  Associate = 'associate',
  Bachelor = 'bachelor',
  Master = 'master',
  Doctorate = 'doctorate',
  Student = 'student',
  Other = 'other',
  Unknown = 'unknown',
}

/** How the patient found the practice. */
export enum ReferralKind {
  /** Word of mouth from another patient or acquaintance. */
  Patient = 'patient',
  /** A named referring colleague or clinic. */
  Professional = 'professional',
  Social = 'social',
  Website = 'website',
  Advertising = 'advertising',
  Other = 'other',
}

export enum DatePrecisionEnum {
  Day = 'day',
  Month = 'month',
  Year = 'year',
}

/** هیلینگ یا کاور اسکرو — what was placed at second-stage surgery. */
export enum AbutmentType {
  Cover = 'cover',
  Healing = 'healing',
  Both = 'both',
  Other = 'other',
  Unknown = 'unknown',
}

/**
 * What was done. An implant placement carries a register number, a brand and
 * a cover; an extraction carries none of those — its follow-up is the check
 * at which an implant gets planned.
 */
export enum SurgeryKind {
  Implant = 'implant',
  Extraction = 'extraction',
}

export enum SurgeryStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum CaseStatus {
  Active = 'active',
  Completed = 'completed',
  OnHold = 'on_hold',
}
