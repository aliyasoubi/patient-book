import type { EducationLevel, Gender } from '../core/models/patient.model';
import type { UserRole } from '../core/models/common.model';

/**
 * Translation keys for the enum values the API speaks.
 *
 * The API sends stable keys — `female`, `bachelor`, `on_hold` — and never
 * wording. The actual copy lives in `public/i18n/*.json`; keeping only stable
 * keys here makes these mappings reusable by templates and runtime services.
 */

export function genderLabel(gender: Gender | string): string {
  switch (gender) {
    case 'female':
      return 'gender.female';
    case 'male':
      return 'gender.male';
    default:
      return 'gender.unknown';
  }
}

export const GENDER_ICONS: Record<string, string> = {
  female: 'woman',
  male: 'man',
  unknown: 'person',
};

export function genderIcon(gender: Gender | string): string {
  return GENDER_ICONS[gender] ?? GENDER_ICONS['unknown'];
}

export function educationLabel(level: EducationLevel | string): string {
  switch (level) {
    case 'none':
      return 'education.none';
    case 'primary':
      return 'education.primary';
    case 'diploma':
      return 'education.diploma';
    case 'associate':
      return 'education.associate';
    case 'bachelor':
      return 'education.bachelor';
    case 'master':
      return 'education.master';
    case 'doctorate':
      return 'education.doctorate';
    case 'student':
      return 'education.student';
    case 'other':
      return 'education.other';
    default:
      return 'education.unknown';
  }
}

/** Every education level, in the order a form should offer them. */
export const EDUCATION_LEVELS: readonly EducationLevel[] = [
  'none',
  'primary',
  'diploma',
  'associate',
  'bachelor',
  'master',
  'doctorate',
  'student',
  'other',
  'unknown',
];

export const GENDERS: readonly Gender[] = ['female', 'male', 'unknown'];

export function referralKindLabel(kind: string): string {
  switch (kind) {
    case 'patient':
      return 'referral.patient';
    case 'professional':
      return 'referral.professional';
    case 'social':
      return 'referral.social';
    case 'website':
      return 'referral.website';
    case 'advertising':
      return 'referral.advertising';
    default:
      return 'referral.other';
  }
}

export const REFERRAL_KIND_ICONS: Record<string, string> = {
  patient: 'group',
  professional: 'stethoscope',
  social: 'share',
  website: 'language',
  advertising: 'campaign',
  other: 'more_horiz',
};

export function referralKindIcon(kind: string): string {
  return REFERRAL_KIND_ICONS[kind] ?? REFERRAL_KIND_ICONS['other'];
}

export function roleLabel(role: UserRole | string | null): string {
  switch (role) {
    case 'admin':
      return 'role.admin';
    case 'dentist':
      return 'role.dentist';
    case 'receptionist':
      return 'role.receptionist';
    default:
      return 'role.viewer';
  }
}

export function caseStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'caseStatus.active';
    case 'completed':
      return 'caseStatus.completed';
    default:
      return 'caseStatus.onHold';
  }
}

export function surgeryStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'surgeryStatus.scheduled';
    case 'completed':
      return 'surgeryStatus.completed';
    default:
      return 'surgeryStatus.cancelled';
  }
}

export function abutmentLabel(type: string): string {
  switch (type) {
    case 'cover':
      return 'abutment.cover';
    case 'healing':
      return 'abutment.healing';
    case 'both':
      return 'abutment.both';
    case 'other':
      return 'abutment.other';
    default:
      return 'abutment.unknown';
  }
}

export function matchMethodLabel(method: string): string {
  switch (method) {
    case 'exact':
      return 'match.exact';
    case 'fuzzy':
      return 'match.fuzzy';
    case 'manual':
      return 'match.manual';
    default:
      return 'match.unmatched';
  }
}

/**
 * Age bands. The API sends stable keys with the bounds baked into them; the
 * label is formed here so the numerals follow the reader's locale.
 */
export function ageBandLabel(band: string): string {
  switch (band) {
    case 'under_13':
      return 'ageBand.under13';
    case '13_19':
      return 'ageBand.13to19';
    case '20_29':
      return 'ageBand.20to29';
    case '30_39':
      return 'ageBand.30to39';
    case '40_49':
      return 'ageBand.40to49';
    case '50_64':
      return 'ageBand.50to64';
    default:
      return 'ageBand.65plus';
  }
}

/**
 * Chip colours for the treatment catalogue, keyed by the `color` the API seeds
 * each treatment type with. Not localised — these are visual tokens.
 */
const PRIMARY_TREATMENT = {
  bg: 'var(--mat-sys-primary-container)',
  fg: 'var(--mat-sys-on-primary-container)',
};
const SECONDARY_TREATMENT = {
  bg: 'var(--mat-sys-secondary-container)',
  fg: 'var(--mat-sys-on-secondary-container)',
};
const TERTIARY_TREATMENT = {
  bg: 'var(--mat-sys-tertiary-container)',
  fg: 'var(--mat-sys-on-tertiary-container)',
};
const ERROR_TREATMENT = {
  bg: 'var(--mat-sys-error-container)',
  fg: 'var(--mat-sys-on-error-container)',
};

export const TREATMENT_COLORS: Record<string, { bg: string; fg: string }> = {
  sky: PRIMARY_TREATMENT,
  cyan: PRIMARY_TREATMENT,
  blue: PRIMARY_TREATMENT,
  teal: SECONDARY_TREATMENT,
  green: SECONDARY_TREATMENT,
  lime: SECONDARY_TREATMENT,
  violet: TERTIARY_TREATMENT,
  indigo: TERTIARY_TREATMENT,
  purple: TERTIARY_TREATMENT,
  amber: TERTIARY_TREATMENT,
  rose: ERROR_TREATMENT,
  orange: ERROR_TREATMENT,
  pink: ERROR_TREATMENT,
  primary: PRIMARY_TREATMENT,
};

export function treatmentColor(key: string): { bg: string; fg: string } {
  return TREATMENT_COLORS[key] ?? TREATMENT_COLORS['primary'];
}
