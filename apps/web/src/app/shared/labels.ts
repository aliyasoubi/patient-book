import type {
  EducationLevel,
  ExpiryState,
  Gender,
  InventoryCategory,
  InventoryMovementKind,
  InventoryUnit,
  LabJaw,
  LabStage,
  LabTripKind,
  LabWorkType,
  UserRole,
} from '../core/models/common.model';

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

/** Follow-up offsets a dentist chooses from, in months after the surgery. */
export const FOLLOW_UP_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

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

export const SURGERY_KINDS = ['implant', 'extraction'] as const;

export function surgeryKindLabel(kind: string): string {
  return kind === 'extraction' ? 'surgeryKind.extraction' : 'surgeryKind.implant';
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

const LAB_STAGE_LABELS: Record<LabStage, string> = {
  at_lab: 'labs.atLab',
  at_clinic: 'labs.atClinic',
  booked: 'labs.booked',
  delivered: 'labs.delivered',
};

/** Where a lab case's work is, by the name of its board column. */
export function labStageLabel(stage: LabStage): string {
  return LAB_STAGE_LABELS[stage];
}

/** What a lab case makes, in the order the form offers them. */
export const LAB_WORK_TYPES: readonly LabWorkType[] = [
  'crown',
  'implant_crown',
  'laminate',
  'post',
  'night_guard',
  'sx',
];

/** Literal keys, not a template, so the i18n check sees every one and a new type cannot miss its label. */
const LAB_WORK_TYPE_LABELS: Record<LabWorkType, string> = {
  crown: 'labWorkType.crown',
  implant_crown: 'labWorkType.implant_crown',
  laminate: 'labWorkType.laminate',
  post: 'labWorkType.post',
  night_guard: 'labWorkType.night_guard',
  sx: 'labWorkType.sx',
};

/** Made per jaw, not per tooth: the form asks for a jaw instead of teeth. */
export function isJawWork(type: LabWorkType | undefined): boolean {
  return type === 'night_guard' || type === 'sx';
}

export function labWorkTypeLabel(type: LabWorkType): string {
  return LAB_WORK_TYPE_LABELS[type];
}

/** Why a case goes to the lab, roughly in the order a case meets them. */
export const LAB_TRIP_KINDS: readonly LabTripKind[] = [
  'impression',
  'scan',
  'wax_alginate',
  'resin',
  'frame',
  'correction',
  'remake',
];

const LAB_TRIP_KIND_LABELS: Record<LabTripKind, string> = {
  impression: 'labTripKind.impression',
  scan: 'labTripKind.scan',
  wax_alginate: 'labTripKind.wax_alginate',
  resin: 'labTripKind.resin',
  frame: 'labTripKind.frame',
  correction: 'labTripKind.correction',
  remake: 'labTripKind.remake',
};

export function labTripKindLabel(kind: LabTripKind): string {
  return LAB_TRIP_KIND_LABELS[kind];
}

/**
 * A lab's turnaround as the book wrote it — «یک هفته»، «سه هفته» — in days.
 * Laminates take three weeks at most labs, everything else about one.
 */
export const LAB_WAIT_DAYS = [3, 7, 10, 14, 21, 28] as const;

export function defaultLabWaitDays(workTypes: readonly LabWorkType[]): number {
  return workTypes.includes('laminate') ? 21 : 7;
}

/** The jaws a night guard is offered for, in the order the form shows them. */
export const LAB_JAWS: readonly LabJaw[] = ['upper', 'lower', 'both'];

const LAB_JAW_LABELS: Record<LabJaw, string> = {
  upper: 'labJaw.upper',
  lower: 'labJaw.lower',
  both: 'labJaw.both',
};

export function labJawLabel(jaw: LabJaw): string {
  return LAB_JAW_LABELS[jaw];
}

/** The store's shelves, in the order the API lists them. */
export const INVENTORY_CATEGORIES: readonly InventoryCategory[] = [
  'implant',
  'prosthetic',
  'regenerative',
  'anesthesia',
  'restorative',
  'endo',
  'impression',
  'surgery',
  'orthodontic',
  'consumable',
  'hygiene',
  'other',
];

const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  implant: 'inventoryCategory.implant',
  prosthetic: 'inventoryCategory.prosthetic',
  regenerative: 'inventoryCategory.regenerative',
  anesthesia: 'inventoryCategory.anesthesia',
  restorative: 'inventoryCategory.restorative',
  endo: 'inventoryCategory.endo',
  impression: 'inventoryCategory.impression',
  surgery: 'inventoryCategory.surgery',
  orthodontic: 'inventoryCategory.orthodontic',
  consumable: 'inventoryCategory.consumable',
  hygiene: 'inventoryCategory.hygiene',
  other: 'inventoryCategory.other',
};

export function inventoryCategoryLabel(category: InventoryCategory): string {
  return INVENTORY_CATEGORY_LABELS[category];
}

/** Each shelf's icon; the implant, abutment and ortho ones match their registers'. */
export const INVENTORY_CATEGORY_ICONS: Record<InventoryCategory, string> = {
  implant: 'deployed_code',
  prosthetic: 'hardware',
  regenerative: 'healing',
  anesthesia: 'syringe',
  restorative: 'dentistry',
  endo: 'stylus',
  impression: 'layers',
  surgery: 'surgical',
  orthodontic: 'straighten',
  consumable: 'masks',
  hygiene: 'clean_hands',
  other: 'inventory_2',
};

/**
 * Where a use is recorded against the patient and its batch: implants, and
 * the grafts and membranes placed with them — what a recall is traced through.
 */
export const TRACEABLE_CATEGORIES: readonly InventoryCategory[] = ['implant', 'regenerative'];

export const INVENTORY_UNITS: readonly InventoryUnit[] = [
  'piece',
  'pack',
  'box',
  'bottle',
  'syringe',
  'cartridge',
  'tube',
  'kit',
  'roll',
];

const INVENTORY_UNIT_LABELS: Record<InventoryUnit, string> = {
  piece: 'inventoryUnit.piece',
  pack: 'inventoryUnit.pack',
  box: 'inventoryUnit.box',
  bottle: 'inventoryUnit.bottle',
  syringe: 'inventoryUnit.syringe',
  cartridge: 'inventoryUnit.cartridge',
  tube: 'inventoryUnit.tube',
  kit: 'inventoryUnit.kit',
  roll: 'inventoryUnit.roll',
};

export function inventoryUnitLabel(unit: InventoryUnit): string {
  return INVENTORY_UNIT_LABELS[unit];
}

const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementKind, string> = {
  receive: 'inventoryMovement.receive',
  use: 'inventoryMovement.use',
  discard: 'inventoryMovement.discard',
  count: 'inventoryMovement.count',
};

export function inventoryMovementLabel(kind: InventoryMovementKind): string {
  return INVENTORY_MOVEMENT_LABELS[kind];
}

export const INVENTORY_MOVEMENT_ICONS: Record<InventoryMovementKind, string> = {
  receive: 'move_to_inbox',
  use: 'outbox',
  discard: 'delete_sweep',
  count: 'fact_check',
};

const EXPIRY_LABELS: Record<ExpiryState, string> = {
  ok: 'inventory.expiresOn',
  expiring: 'inventory.expiringOn',
  expired: 'inventory.expiredOn',
};

/** How an item's expiry reads on its row, by how near it is. */
export function expiryLabel(state: ExpiryState | null): string {
  return EXPIRY_LABELS[state ?? 'ok'];
}
