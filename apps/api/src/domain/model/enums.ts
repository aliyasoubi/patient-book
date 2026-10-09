export enum UserRole {
  /** Full access, including user management and permanent deletion. */
  Admin = 'admin',
  /** Clinical staff: full patient read/write, no user management. */
  Dentist = 'dentist',
  /**
   * Front desk: patient read/write, no deletion, and clinical notes (medical
   * history, patient and surgery notes) read-only — see clinical-notes.policy.
   */
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

/**
 * What a lab case makes. A case is one kind of work; older ones, written when
 * the book's "laminate and implant crown" rows were kept as one case, may still
 * hold several, which is why the case stores a list.
 */
export enum LabWorkType {
  /** روکش دندان — the book's «روکش زیرکونیا» rows are this. */
  Crown = 'crown',
  /** روکش ایمپلنت — the one that sends impression copings and analogs along. */
  ImplantCrown = 'implant_crown',
  Laminate = 'laminate',
  Post = 'post',
  NightGuard = 'night_guard',
  Sx = 'sx',
}

/**
 * Which jaw a whole-arch piece of work is for. A night guard is made per jaw,
 * not per tooth, so it carries this instead of a tooth count and numbers.
 */
export enum LabJaw {
  Upper = 'upper',
  Lower = 'lower',
  Both = 'both',
}

/** Work made per jaw, not per tooth: it carries a jaw instead of tooth numbers. */
export const JAW_WORK_TYPES: readonly LabWorkType[] = [
  LabWorkType.NightGuard,
  LabWorkType.Sx,
];

/**
 * The teeth a lab case can name, in FDI notation (ISO 3950): the quadrant —
 * 1 upper right, 2 upper left, 3 lower left, 4 lower right, as the patient's
 * own sides — then the tooth from the midline, 1 to 7. Wisdom teeth are not
 * offered: the practice does not send them to the lab.
 */
export const LAB_TOOTH_NUMBERS: readonly number[] = [1, 2, 3, 4].flatMap((q) =>
  [1, 2, 3, 4, 5, 6, 7].map((n) => q * 10 + n),
);

/**
 * Why a case went to the lab this time. A crown or a laminate makes several
 * trips — the impression, a resin or frame try-in, now and then a correction
 * or a remake — and each is one of these.
 */
export enum LabTripKind {
  /** ارسال قالب */
  Impression = 'impression',
  /** ارسال اسکن — a digital impression. */
  Scan = 'scan',
  /** ارسال موم و آلژینات */
  WaxAlginate = 'wax_alginate',
  /** ارسال رزین — a resin try-in, usually for laminates. */
  Resin = 'resin',
  /** ارسال فریم — a framework try-in, usually for crowns. */
  Frame = 'frame',
  /** اصلاح */
  Correction = 'correction',
  /** تکرار */
  Remake = 'remake',
}

/**
 * The shelves of a dental store, as supply catalogues group them. A fixed
 * list rather than a catalogue managed in Settings: the groups are the
 * trade's own and rarely change, and a fixed list is what lets every screen
 * filter, and the dashboard count, the same way.
 */
export enum InventoryCategory {
  /** ایمپلنت — a fixture, by system, line and size. */
  Implant = 'implant',
  /** قطعات پروتزی ایمپلنت — healing caps, abutments, analogs, screws. */
  Prosthetic = 'prosthetic',
  /** پیوند استخوان و ممبران */
  Regenerative = 'regenerative',
  /** بی‌حسی — cartridges, needles, topical gel. */
  Anesthesia = 'anesthesia',
  /** ترمیمی و زیبایی — composites, bonding, etch, cements, veneer materials. */
  Restorative = 'restorative',
  Endo = 'endo',
  /** قالب‌گیری */
  Impression = 'impression',
  /** جراحی — sutures, blades, surgical disposables. */
  Surgery = 'surgery',
  Orthodontic = 'orthodontic',
  /** مصرفی و ضدعفونی — gloves, gauze, masks, disinfectants. */
  Consumable = 'consumable',
  /** بهداشت دهان — toothbrushes and pastes handed or sold to patients. */
  Hygiene = 'hygiene',
  Other = 'other',
}

/** What one of an item's quantity counts. */
export enum InventoryUnit {
  Piece = 'piece',
  Pack = 'pack',
  Box = 'box',
  Bottle = 'bottle',
  Syringe = 'syringe',
  Cartridge = 'cartridge',
  Tube = 'tube',
  Kit = 'kit',
  Roll = 'roll',
}

/**
 * Why a stock level changed. Quantity is never edited directly: every change
 * is one of these, so the balance always equals the sum of its history.
 */
export enum InventoryMovementKind {
  /** ورود — a delivery from a supplier. */
  Receive = 'receive',
  /** مصرف — used on a patient or in the clinic. */
  Use = 'use',
  /** دورریز — expired, damaged or lost. */
  Discard = 'discard',
  /**
   * شمارش — a stocktake: the quantity counted on the shelf replaces the
   * balance. An item's opening balance, and the workbook import, are counts.
   */
  Count = 'count',
}
