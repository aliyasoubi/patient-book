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
  SurgeryItemNotFound = 'ERR_SURGERY_ITEM_NOT_FOUND',

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
