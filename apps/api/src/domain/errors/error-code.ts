/**
 * Stable, locale-independent identifiers for every failure this system can
 * report to a client.
 *
 * The API deliberately does **not** return prose. A Persian sentence baked into
 * a service couples the domain to one audience's language and leaves the
 * frontend unable to render anything else. Clients receive a code plus the
 * parameters needed to interpolate it, and choose their own wording.
 *
 * Values are stable strings, not ordinals: they appear in client code and in
 * logs, so renumbering must never silently change meaning.
 */
export enum ErrorCode {
  // -- Generic ---------------------------------------------------------
  Unexpected = 'ERR_UNEXPECTED',
  NotFound = 'ERR_NOT_FOUND',
  Forbidden = 'ERR_FORBIDDEN',
  Unauthorized = 'ERR_UNAUTHORIZED',
  ValidationFailed = 'ERR_VALIDATION_FAILED',
  RateLimited = 'ERR_RATE_LIMITED',

  // -- Identity & access ------------------------------------------------
  InvalidCredentials = 'ERR_INVALID_CREDENTIALS',
  AccountDisabled = 'ERR_ACCOUNT_DISABLED',
  SessionExpired = 'ERR_SESSION_EXPIRED',
  SessionRevoked = 'ERR_SESSION_REVOKED',
  PasswordChangeRequired = 'ERR_PASSWORD_CHANGE_REQUIRED',
  CurrentPasswordWrong = 'ERR_CURRENT_PASSWORD_WRONG',
  UsernameTaken = 'ERR_USERNAME_TAKEN',
  CannotDisableSelf = 'ERR_CANNOT_DISABLE_SELF',
  CannotDemoteSelf = 'ERR_CANNOT_DEMOTE_SELF',
  CannotDeleteSelf = 'ERR_CANNOT_DELETE_SELF',

  // -- Patient ----------------------------------------------------------
  PatientNotFound = 'ERR_PATIENT_NOT_FOUND',
  FileNumberTaken = 'ERR_FILE_NUMBER_TAKEN',
  FileNumberInvalid = 'ERR_FILE_NUMBER_INVALID',
  /**
   * The record was saved by someone else after this client loaded it. The
   * client keeps the user's draft, reloads, and lets them decide.
   */
  PatientModified = 'ERR_PATIENT_MODIFIED',

  // -- Registries -------------------------------------------------------
  RegistryCaseNotFound = 'ERR_REGISTRY_CASE_NOT_FOUND',
  RegistryNumberTaken = 'ERR_REGISTRY_NUMBER_TAKEN',
  /** As {@link ErrorCode.PatientModified}, for a register case. */
  RegistryCaseModified = 'ERR_REGISTRY_CASE_MODIFIED',
  SurgeryItemNotFound = 'ERR_SURGERY_ITEM_NOT_FOUND',
  /** As {@link ErrorCode.PatientModified}, for a surgery-list row. */
  SurgeryItemModified = 'ERR_SURGERY_ITEM_MODIFIED',

  // -- Lab work ---------------------------------------------------------
  LabNotFound = 'ERR_LAB_NOT_FOUND',
  LabNameTaken = 'ERR_LAB_NAME_TAKEN',
  LabCaseNotFound = 'ERR_LAB_CASE_NOT_FOUND',
  /** As {@link ErrorCode.PatientModified}, for a lab case. */
  LabCaseModified = 'ERR_LAB_CASE_MODIFIED',
  /**
   * The case is no longer where this move starts from — someone else has
   * received, sent or delivered it meanwhile. `params.stage` is where it is.
   */
  LabCaseMoved = 'ERR_LAB_CASE_MOVED',
  /** Undo on a case that has only its first trip: archive it instead. */
  LabCaseNothingToUndo = 'ERR_LAB_CASE_NOTHING_TO_UNDO',

  // -- Inventory --------------------------------------------------------
  InventoryItemNotFound = 'ERR_INVENTORY_ITEM_NOT_FOUND',
  /**
   * An active item with the same category, name, brand and specification
   * already exists; stock of one thing must not be split across two rows.
   * `params.id` is the existing item.
   */
  InventoryItemExists = 'ERR_INVENTORY_ITEM_EXISTS',
  /** As {@link ErrorCode.PatientModified}, for an inventory item. */
  InventoryItemModified = 'ERR_INVENTORY_ITEM_MODIFIED',
  /**
   * More taken out than is on the shelf — or in the batch named.
   * `params.available` is what there is.
   */
  InventoryInsufficientStock = 'ERR_INVENTORY_INSUFFICIENT_STOCK',
  InventoryLotNotFound = 'ERR_INVENTORY_LOT_NOT_FOUND',
  /** A batch corrected to the lot and expiry of another batch of the same item. */
  InventoryLotExists = 'ERR_INVENTORY_LOT_EXISTS',

  // -- Value objects ----------------------------------------------------
  NationalIdLength = 'ERR_NATIONAL_ID_LENGTH',
  NationalIdChecksum = 'ERR_NATIONAL_ID_CHECKSUM',
  MobileInvalid = 'ERR_MOBILE_INVALID',
  PhoneInvalid = 'ERR_PHONE_INVALID',

  // -- Jalali dates -----------------------------------------------------
  DateEmpty = 'ERR_DATE_EMPTY',
  DateUnknownFormat = 'ERR_DATE_UNKNOWN_FORMAT',
  DateNonNumeric = 'ERR_DATE_NON_NUMERIC',
  DateAmbiguousYear = 'ERR_DATE_AMBIGUOUS_YEAR',
  DateYearOutOfRange = 'ERR_DATE_YEAR_OUT_OF_RANGE',
  DateMonthInvalid = 'ERR_DATE_MONTH_INVALID',
  DateDayInvalid = 'ERR_DATE_DAY_INVALID',
  DateNotOnCalendar = 'ERR_DATE_NOT_ON_CALENDAR',

  // -- Catalogue --------------------------------------------------------
  UnknownTreatmentCode = 'ERR_UNKNOWN_TREATMENT_CODE',
  SortFieldUnsupported = 'ERR_SORT_FIELD_UNSUPPORTED',

  // -- Data exchange ----------------------------------------------------
  /** The upload could not be parsed as a workbook at all. */
  WorkbookUnreadable = 'ERR_WORKBOOK_UNREADABLE',
  /** A workbook parsed, but holds none of the sheets this app knows. */
  WorkbookSheetsMissing = 'ERR_WORKBOOK_SHEETS_MISSING',
  /**
   * The record changed after the preview was taken, so applying would
   * overwrite an edit the reviewer never saw. The caller re-previews.
   */
  ReconcileConflict = 'ERR_RECONCILE_CONFLICT',
  /** A field name that is not one this reconcile is allowed to write. */
  ReconcileFieldUnknown = 'ERR_RECONCILE_FIELD_UNKNOWN',
}

/** Values interpolated into a rendered message, e.g. `{ fileNo: '11559' }`. */
export type ErrorParams = Readonly<Record<string, string | number>>;
