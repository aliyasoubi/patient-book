import type { EducationLevel, Gender } from '../core/models/patient.model';
import type { UserRole } from '../core/models/common.model';

/**
 * Display text for the enum values the API speaks.
 *
 * The API sends stable keys — `female`, `bachelor`, `on_hold` — and never
 * wording, so every label a user reads is defined here and extracted by
 * `$localize` along with the rest of the app's text.
 *
 * Built lazily through functions rather than as module-level constants: a
 * `$localize` tagged template evaluated at module load runs before the runtime
 * has its translations, which silently pins the source locale.
 */

export function genderLabel(gender: Gender | string): string {
  switch (gender) {
    case 'female':
      return $localize`:@@gender.female:زن`;
    case 'male':
      return $localize`:@@gender.male:مرد`;
    default:
      return $localize`:@@gender.unknown:نامشخص`;
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
      return $localize`:@@education.none:بی‌سواد`;
    case 'primary':
      return $localize`:@@education.primary:زیر دیپلم`;
    case 'diploma':
      return $localize`:@@education.diploma:دیپلم`;
    case 'associate':
      return $localize`:@@education.associate:فوق دیپلم`;
    case 'bachelor':
      return $localize`:@@education.bachelor:کارشناسی`;
    case 'master':
      return $localize`:@@education.master:کارشناسی ارشد`;
    case 'doctorate':
      return $localize`:@@education.doctorate:دکتری`;
    case 'student':
      return $localize`:@@education.student:محصل / دانشجو`;
    case 'other':
      return $localize`:@@education.other:سایر`;
    default:
      return $localize`:@@education.unknown:نامشخص`;
  }
}

/** Every education level, in the order a form should offer them. */
export const EDUCATION_LEVELS: readonly EducationLevel[] = [
  'none', 'primary', 'diploma', 'associate', 'bachelor',
  'master', 'doctorate', 'student', 'other', 'unknown',
];

export const GENDERS: readonly Gender[] = ['female', 'male', 'unknown'];

export function referralKindLabel(kind: string): string {
  switch (kind) {
    case 'patient':
      return $localize`:@@referral.patient:معرفی بیمار`;
    case 'professional':
      return $localize`:@@referral.professional:معرفی همکار`;
    case 'social':
      return $localize`:@@referral.social:شبکه‌های اجتماعی`;
    case 'website':
      return $localize`:@@referral.website:وب‌سایت`;
    case 'advertising':
      return $localize`:@@referral.advertising:تبلیغات`;
    default:
      return $localize`:@@referral.other:سایر`;
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
      return $localize`:@@role.admin:مدیر سیستم`;
    case 'dentist':
      return $localize`:@@role.dentist:دندانپزشک`;
    case 'receptionist':
      return $localize`:@@role.receptionist:پذیرش`;
    default:
      return $localize`:@@role.viewer:فقط مشاهده`;
  }
}

export function caseStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return $localize`:@@caseStatus.active:در جریان`;
    case 'completed':
      return $localize`:@@caseStatus.completed:تکمیل شده`;
    default:
      return $localize`:@@caseStatus.onHold:متوقف`;
  }
}

export function surgeryStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return $localize`:@@surgeryStatus.scheduled:در انتظار`;
    case 'completed':
      return $localize`:@@surgeryStatus.completed:انجام شده`;
    default:
      return $localize`:@@surgeryStatus.cancelled:لغو شده`;
  }
}

export function abutmentLabel(type: string): string {
  switch (type) {
    case 'cover':
      return $localize`:@@abutment.cover:کاور اسکرو`;
    case 'healing':
      return $localize`:@@abutment.healing:هیلینگ`;
    case 'both':
      return $localize`:@@abutment.both:کاور و هیلینگ`;
    case 'other':
      return $localize`:@@abutment.other:سایر`;
    default:
      return $localize`:@@abutment.unknown:نامشخص`;
  }
}

export function matchMethodLabel(method: string): string {
  switch (method) {
    case 'exact':
      return $localize`:@@match.exact:تطبیق دقیق نام`;
    case 'fuzzy':
      return $localize`:@@match.fuzzy:تطبیق تقریبی نام`;
    case 'manual':
      return $localize`:@@match.manual:اتصال دستی`;
    default:
      return $localize`:@@match.unmatched:بدون اتصال`;
  }
}

/**
 * Age bands. The API sends stable keys with the bounds baked into them; the
 * label is formed here so the numerals follow the reader's locale.
 */
export function ageBandLabel(band: string): string {
  switch (band) {
    case 'under_13':
      return $localize`:@@ageBand.under13:زیر ۱۳`;
    case '13_19':
      return $localize`:@@ageBand.13to19:۱۳ تا ۱۹`;
    case '20_29':
      return $localize`:@@ageBand.20to29:۲۰ تا ۲۹`;
    case '30_39':
      return $localize`:@@ageBand.30to39:۳۰ تا ۳۹`;
    case '40_49':
      return $localize`:@@ageBand.40to49:۴۰ تا ۴۹`;
    case '50_64':
      return $localize`:@@ageBand.50to64:۵۰ تا ۶۴`;
    default:
      return $localize`:@@ageBand.65plus:۶۵ به بالا`;
  }
}

/**
 * Chip colours for the treatment catalogue, keyed by the `color` the API seeds
 * each treatment type with. Not localised — these are visual tokens.
 */
export const TREATMENT_COLORS: Record<string, { bg: string; fg: string }> = {
  violet: { bg: 'color-mix(in srgb, #7c4dff 16%, transparent)', fg: '#7c4dff' },
  sky: { bg: 'color-mix(in srgb, #0288d1 16%, transparent)', fg: '#0288d1' },
  indigo: { bg: 'color-mix(in srgb, #3f51b5 16%, transparent)', fg: '#3f51b5' },
  rose: { bg: 'color-mix(in srgb, #e91e63 16%, transparent)', fg: '#e91e63' },
  amber: { bg: 'color-mix(in srgb, #ff8f00 18%, transparent)', fg: '#ff8f00' },
  cyan: { bg: 'color-mix(in srgb, #00acc1 16%, transparent)', fg: '#00acc1' },
  teal: { bg: 'color-mix(in srgb, #00897b 16%, transparent)', fg: '#00897b' },
  purple: { bg: 'color-mix(in srgb, #8e24aa 16%, transparent)', fg: '#8e24aa' },
  orange: { bg: 'color-mix(in srgb, #f4511e 16%, transparent)', fg: '#f4511e' },
  green: { bg: 'color-mix(in srgb, #43a047 16%, transparent)', fg: '#43a047' },
  lime: { bg: 'color-mix(in srgb, #afb42b 20%, transparent)', fg: '#827717' },
  pink: { bg: 'color-mix(in srgb, #d81b60 16%, transparent)', fg: '#d81b60' },
  blue: { bg: 'color-mix(in srgb, #1e88e5 16%, transparent)', fg: '#1e88e5' },
  primary: { bg: 'var(--mat-sys-secondary-container)', fg: 'var(--mat-sys-on-secondary-container)' },
};

export function treatmentColor(key: string): { bg: string; fg: string } {
  return TREATMENT_COLORS[key] ?? TREATMENT_COLORS['primary'];
}
