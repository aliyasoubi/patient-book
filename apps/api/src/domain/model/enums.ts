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
 * What a lab case makes. A case can be more than one at once — the book has
 * «لمینیت و روکش ایمپلنت» on a single row — so a case holds a set of these.
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
 * The shelves of the clinic's store, as the practice's stock workbook groups
 * them: one sheet per implant system, one for healing caps, one for
 * abutments and their parts, the grafts and membranes, and the general
 * store's columns. A fixed list rather than a catalogue: the groups are the
 * trade's own and rarely change, and a fixed list is what lets every screen
 * filter and the dashboard count the same way.
 */
export enum InventoryCategory {
  /** ایمپلنت — a fixture, by system, line and size. */
  Implant = 'implant',
  /** هیلینگ اباتمنت */
  Healing = 'healing',
  /** اباتمنت و قطعات پروتزی — abutments, analogs, cover screws. */
  Abutment = 'abutment',
  /** پودر استخوان */
  Graft = 'graft',
  /** ممبران */
  Membrane = 'membrane',
  /** بی‌حسی — cartridges, needles. */
  Anesthesia = 'anesthesia',
  Composite = 'composite',
  /** لمینت — veneer cements, porcelain etch, silane. */
  Laminate = 'laminate',
  /** مواد قالب‌گیری */
  Impression = 'impression',
  Endo = 'endo',
  /** جراحی — sutures, blades, surgical consumables. */
  Surgery = 'surgery',
  /** ترمیمی و عمومی — the general store's first column. */
  Restorative = 'restorative',
  Orthodontic = 'orthodontic',
  /** مصرفی — gloves, gauze, masks, disinfectants. */
  Consumable = 'consumable',
  /** مسواک و خمیردندان — hygiene products handed or sold to patients. */
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
