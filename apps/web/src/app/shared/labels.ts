import type { EducationLevel, Gender, UserRole } from '../core/models/common.model';

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

export const SURGERY_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

export const ABUTMENT_TYPES = ['unknown', 'cover', 'healing', 'both', 'other'] as const;

/**
 * Implant systems the practice uses. Stable, ASCII-only keys — the display
 * name for each lives in `implantBrand.<key>` in `fa.json`, since that's the
 * literal value the API expects (see `IMPLANT_BRAND_NAMES` on the API), not
 * just a translatable label.
 */
export const IMPLANT_BRAND_KEYS = [
  'zimmer',
  'dentium',
  'straumann',
  'neobiotech',
  'sky',
  'megagen',
  'speed',
  'implantium',
  'osstem',
  'nobel',
  'tri',
  'dio',
  'superline',
] as const;

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

/**
 * Translation key for a field name as it appears in an audit-history entry or
 * a reconcile diff — both describe the same underlying `Patient`/registry
 * fields, so both read this one mapping.
 */
export function fieldLabel(key: string): string {
  switch (key) {
    case 'fileNo':
      return 'field.fileNo';
    case 'firstName':
      return 'field.firstName';
    case 'lastName':
      return 'field.lastName';
    case 'nationalId':
      return 'field.nationalId';
    case 'mobile':
      return 'field.mobile';
    case 'homePhone':
      return 'field.homePhone';
    case 'gender':
      return 'field.gender';
    case 'birthDate':
      return 'field.birthDate';
    case 'occupation':
      return 'field.occupation';
    case 'education':
      return 'field.education';
    case 'educationRaw':
      return 'field.educationOriginal';
    case 'referralSource':
    case 'referralSourceName':
      return 'field.referralSource';
    case 'medicalHistory':
      return 'field.medicalHistory';
    case 'homeAddress':
      return 'field.homeAddress';
    case 'workAddress':
      return 'field.workAddress';
    case 'firstVisitAt':
      return 'field.firstVisit';
    case 'lastVisitAt':
      return 'field.lastVisit';
    case 'notes':
      return 'field.notes';
    case 'treatments':
      return 'field.treatments';
    case 'dataIssues':
      return 'field.dataIssues';
    case 'isArchived':
      return 'field.archiveStatus';
    case 'fullName':
      return 'field.fullName';
    case 'resolvedIssue':
      return 'field.resolvedIssue';
    case 'recordedName':
      return 'field.recordedName';
    default:
      return key;
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
 *
 * The keys are the seed's thirteen hue names; they collapse onto the eight
 * categorical `--pb-cat-*` tokens in styles.scss. None of them is an M3
 * accent container: `error`, `tertiary` and `secondary` mean alert, warning
 * and success on status chips, and a treatment is none of those.
 */
function categorical(name: string): { bg: string; fg: string } {
  return { bg: `var(--pb-cat-${name}-bg)`, fg: `var(--pb-cat-${name}-fg)` };
}

export const TREATMENT_COLORS: Record<string, { bg: string; fg: string }> = {
  sky: categorical('sky'),
  cyan: categorical('sky'),
  blue: categorical('sky'),
  teal: categorical('teal'),
  lime: categorical('teal'),
  green: categorical('green'),
  indigo: categorical('indigo'),
  violet: categorical('violet'),
  purple: categorical('violet'),
  rose: categorical('plum'),
  pink: categorical('plum'),
  amber: categorical('sand'),
  orange: categorical('sand'),
  primary: categorical('slate'),
};

export function treatmentColor(key: string): { bg: string; fg: string } {
  return TREATMENT_COLORS[key] ?? TREATMENT_COLORS['primary'];
}
