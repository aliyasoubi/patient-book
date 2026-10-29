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
  | 'none'
  | 'primary'
  | 'diploma'
  | 'associate'
  | 'bachelor'
  | 'master'
  | 'doctorate'
  | 'student'
  | 'other'
  | 'unknown';

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
  /** Optimistic-concurrency token; sent back as `expectedVersion` on update. */
  version: number;
}

export type SurgeryKind = 'implant' | 'extraction' | 'bone_graft' | 'sinus_lift' | 'prosthesis';

/** Where a row's follow-up stands with the patient. */
export type FollowUpStatus = 'open' | 'booked' | 'declined';

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
  /** FDI numbers picked on the chart; empty on rows written before it. */
  teethFdi: number[];
  /** Legacy phrase, shown only when there are no `teethFdi`. */
  toothPosition: string;
  /** The implants taken from the stock for this surgery, in the order they were used. */
  implants: PlacedImplant[];
  implantBrand: string | null;
  abutmentType: 'cover' | 'healing' | 'both' | 'other' | 'unknown';
  abutmentRaw: string | null;
  /** Legacy free text ("آذر ماه") from the import; new rows use the fields below. */
  prosthesisDue: string | null;
  /** Months after the surgery the follow-up is due; the API derives the date. */
  followUpMonths: number | null;
  followUpDate: { jalali: string; iso: string } | null;
  followUpStatus: FollowUpStatus;
  /** Jalali day the patient was booked for; only while `booked`, and optional even then. */
  followUpAppointmentAt: string | null;
  followUpState: FollowUpState;
  /** The day the last call said to call again; apart from the follow-up's own date. */
  nextContactAt: { jalali: string; iso: string } | null;
  /** The latest call about the follow-up, for the card. */
  lastContact: FollowUpContact | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
  /** Optimistic-concurrency token; sent back as `expectedVersion` on an edit. */
  version: number;
}

/**
 * One implant from the stock filed under a surgery: the teeth it went into,
 * the box — item, system, size and lot — how many, and what the use said.
 */
export interface PlacedImplant {
  teeth: number[];
  name: string;
  brand: string | null;
  spec: string | null;
  lotNumber: string | null;
  quantity: number;
  note: string | null;
}

/** What a call about a follow-up came to; the last two settle it. */
export type ContactOutcome = 'no_answer' | 'call_later' | 'booked' | 'declined';

/** One call about a follow-up, as the API formats it. */
export interface FollowUpContact {
  outcome: ContactOutcome;
  note: string | null;
  /** Jalali day this call said to call again. */
  nextContactAt: string | null;
  /** Who made the call, by name. */
  by: string | null;
  /** Jalali date and Tehran time, `yyyy/MM/dd HH:mm`. */
  at: string;
}

/** Judged by the API against the current Jalali month. */
export type FollowUpState = 'none' | 'pending' | 'due' | 'overdue' | 'booked' | 'declined';

/** The list's follow-up windows; the API owns what each means in dates. */
export type FollowUpFilter =
  'callsToday' | 'pending' | 'week' | 'thisMonth' | 'nextMonth' | 'overdue' | 'booked' | 'declined';

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

/** Where a lab case's work is now — the lab board's three columns. */
export type LabStage = 'at_lab' | 'at_clinic' | 'booked' | 'delivered';
/** A night guard is made per jaw, so it records this instead of teeth. */
export type LabJaw = 'upper' | 'lower' | 'both';
export type LabWorkType = 'crown' | 'implant_crown' | 'laminate' | 'post' | 'night_guard' | 'sx';
export type LabTripKind =
  'impression' | 'scan' | 'wax_alginate' | 'resin' | 'frame' | 'correction' | 'remake';
/** A trip out, judged by the API against the day the lab said it would be back. */
export type LabTimeliness = 'on_time' | 'due_today' | 'overdue';

export interface Lab {
  id: string;
  name: string;
  /** Inactive labs stay on their old cases but are not offered for new ones. */
  isActive: boolean;
}

/** One trip to the lab and back. Dates are Jalali `yyyy/MM/dd`. */
export interface LabTrip {
  id: string;
  /** 1 for the first trip, counting up. */
  sequence: number;
  kind: LabTripKind;
  sentAt: string;
  waitDays: number;
  expectedAt: string;
  /** Null while the trip is out at the lab. */
  receivedAt: string | null;
  note: string | null;
}

/** One charted tooth of a lab case and its work — a crown on 14, a laminate on 11. */
export interface LabToothWork {
  tooth: number;
  workType: LabWorkType;
}

export interface LabCase {
  id: string;
  patientId: string | null;
  patient: { id: string; fileNo: string; fullName: string; mobile: string | null } | null;
  recordedName: string;
  lab: Lab | null;
  /** The kinds of work, in the order the form offers them; for charted work, read off its teeth. */
  workTypes: LabWorkType[];
  jaw: LabJaw | null;
  /** FDI numbers picked on the chart, sorted. Empty for per-jaw work and for older cases. */
  teethFdi: number[];
  /** Each charted tooth and the work it gets, in tooth order. */
  toothWork: LabToothWork[];
  /** The chart's count; for a case written before the chart, the count staff typed. */
  toothCount: number | null;
  /** Older cases only: the tooth text as typed. */
  teeth: string;
  implantBrand: string | null;
  impressionCount: number | null;
  analogCount: number | null;
  partsReturnedAt: string | null;
  /** Impression copings or analogs went with the case and have not come back. */
  /** The day the patient is booked for the fitting, once the front desk has given one. */
  appointmentAt: string | null;
  /** Only while booked: the day still ahead, today, or already past. */
  appointmentTimeliness: LabTimeliness | null;
  /** Only while booked: days until the booking, negative once it has passed. */
  appointmentDays: number | null;
  partsOutstanding: boolean;
  /** The day the lab was given to send the parts, once the work came back without them. */
  partsDueAt: string | null;
  partsTimeliness: LabTimeliness | null;
  partsDaysLate: number;
  deliveredAt: string | null;
  stage: LabStage;
  /** When the case entered its current column. */
  since: string | null;
  daysInStage: number | null;
  /** Only while at the lab. */
  timeliness: LabTimeliness | null;
  daysLate: number;
  /** Oldest first. */
  trips: LabTrip[];
  notes: string | null;
  isArchived: boolean;
  /** Bumped by every edit and every move; sent back on an edit and on undo. */
  version: number;
}

/** Every open case by column, most urgent first, and the recent deliveries. */
export interface LabBoard {
  atLab: LabCase[];
  /** Back at the clinic, the patient not yet booked. */
  atClinic: LabCase[];
  /** Back at the clinic, the patient booked for a day. */
  booked: LabCase[];
  delivered: LabCase[];
  /** Back at the clinic or delivered, parts still owed and a day set for them. */
  partsChase: LabCase[];
}

/** The store's shelves, as the API's `InventoryCategory`. */
export type InventoryCategory =
  | 'implant'
  | 'prosthetic'
  | 'regenerative'
  | 'anesthesia'
  | 'restorative'
  | 'endo'
  | 'impression'
  | 'surgery'
  | 'orthodontic'
  | 'consumable'
  | 'hygiene'
  | 'other';
export type InventoryUnit =
  'piece' | 'pack' | 'box' | 'bottle' | 'syringe' | 'cartridge' | 'tube' | 'kit' | 'roll';
/** Why a balance changed; quantity changes only through one of these. */
export type InventoryMovementKind = 'receive' | 'use' | 'discard' | 'count';
/** The list's questions: what to order, what has run out, what expires soon. */
export type InventoryFilter = 'reorder' | 'out' | 'expiry';
/** Judged by the API: nothing left, or at or under the reorder level. */
export type StockState = 'ok' | 'low' | 'out';
/** Of what is on the shelf; null when the shelf is empty or undated. */
export type ExpiryState = 'ok' | 'expiring' | 'expired';

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  name: string;
  brand: string | null;
  /** Model, size or shade, as written. */
  spec: string | null;
  unit: InventoryUnit;
  quantity: number;
  minQuantity: number | null;
  stockState: StockState;
  /** As printed on the pack, in its own calendar: `2028/07`, `1407/05`. */
  expiry: string | null;
  expiryState: ExpiryState | null;
  notes: string | null;
  /** Sold to patients to take home: a use asks who it was sold to. */
  /** A use must name its patient: an implant or a membrane. */
  usedPerPatient?: boolean;
  soldToPatients: boolean;
  isArchived: boolean;
  /** Bumped by every edit and every movement; sent back on an edit. */
  version: number;
}

/** One batch of an item on the shelf. */
export interface InventoryLot {
  id: string;
  lotNumber: string | null;
  /** As printed on the pack. */
  expiry: string | null;
  expiryState: ExpiryState | null;
  quantity: number;
}

/** One line of an item's stock card — one batch's change. */
export interface InventoryMovement {
  id: string;
  kind: InventoryMovementKind;
  /** Signed; for a count, the difference it found. */
  change: number;
  quantityAfter: number;
  lotNumber: string | null;
  expiry: string | null;
  /** The patient a use went into, or an item was sold to. */
  patient: { id: string; fileNo: string; fullName: string } | null;
  note: string | null;
  /** Who recorded it, by the name staff know them by. */
  by: string | null;
  /** Jalali `yyyy/MM/dd HH:mm`. */
  at: string;
}

export interface InventoryItemDetail extends InventoryItem {
  /** The batches on the shelf, first-expiring first. */
  lots: InventoryLot[];
  /** Newest first. */
  movements: InventoryMovement[];
}

/** The front desk's work: each count is a list the dashboard links to. */
export interface DashboardSummary {
  needsReview: number;
  followUpsThisWeek: number;
  followUpsOverdue: number;
  /** Patients to call today: the follow-up list's «تماس امروز». */
  callsToday: number;
  labsOverdue: number;
  /** Lab work that is back with no booking for the patient yet. */
  labsToBook: number;
  inventoryReorder: number;
  inventoryExpiring: number;
  /** The recall list: no visit on file in over a year. */
  inactiveOverYear: number;
}

/** One column of the consumption table: a Jalali month, and how much of it is on record. */
export interface ConsumptionMonth {
  /** `yyyy/MM` on the Jalali calendar. */
  month: string;
  /** Stock was recorded in this month; before that a cell is unknown, not zero. */
  tracked: boolean;
  /** The day recording began, when it began part-way through this month. */
  trackedFromDay: number | null;
  /** This month, still running. */
  current: boolean;
}

/** One item's units used each month, in its own unit. */
export interface ItemConsumption {
  id: string;
  category: InventoryCategory;
  name: string;
  brand: string | null;
  spec: string | null;
  unit: InventoryUnit;
  archived: boolean;
  /** Per month, in the order of {@link MaterialConsumption.months}. */
  used: number[];
  total: number;
  /** Over complete months only; null until a whole month is on record. */
  monthlyAverage: number | null;
}

/** How much of each material the clinic used, month by month. */
export interface MaterialConsumption {
  months: ConsumptionMonth[];
  /** The day the first stock card line was written, `yyyy/MM/dd`. */
  trackedFrom: string | null;
  /** Items used at least once in the window, most used first. */
  items: ItemConsumption[];
}

/** How the practice looks, for the statistics page. */
export interface PracticeStats {
  totals: {
    patients: number;
    archived: number;
    implantCases: number;
    orthoCases: number;
    /** Seen in the last six months. */
    recentlyActive: number;
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
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  username: string | null;
  /** The author's display name, when the account still has one. */
  fullName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: Record<string, { from?: unknown; to?: unknown } | unknown> | null;
  createdAt: string;
}
