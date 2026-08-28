/**
 * Error codes the API can return.
 *
 * Mirrors `ErrorCode` in the API's domain layer. Kept as a plain union rather
 * than imported, because the two apps build independently; the API's Swagger
 * document is the contract, and `ApiErrorTranslator` falls back gracefully when
 * a code arrives that this list has not caught up with yet.
 */
export type ApiErrorCode =
  // Generic
  | 'ERR_UNEXPECTED'
  | 'ERR_NOT_FOUND'
  | 'ERR_FORBIDDEN'
  | 'ERR_UNAUTHORIZED'
  | 'ERR_VALIDATION_FAILED'
  | 'ERR_RATE_LIMITED'
  // Identity & access
  | 'ERR_INVALID_CREDENTIALS'
  | 'ERR_ACCOUNT_DISABLED'
  | 'ERR_SESSION_EXPIRED'
  | 'ERR_SESSION_REVOKED'
  | 'ERR_PASSWORD_CHANGE_REQUIRED'
  | 'ERR_CURRENT_PASSWORD_WRONG'
  | 'ERR_USERNAME_TAKEN'
  | 'ERR_CANNOT_DISABLE_SELF'
  | 'ERR_CANNOT_DEMOTE_SELF'
  | 'ERR_CANNOT_DELETE_SELF'
  // Patient
  | 'ERR_PATIENT_NOT_FOUND'
  | 'ERR_FILE_NUMBER_TAKEN'
  | 'ERR_FILE_NUMBER_INVALID'
  // Registries
  | 'ERR_REGISTRY_CASE_NOT_FOUND'
  | 'ERR_REGISTRY_NUMBER_TAKEN'
  | 'ERR_SURGERY_ITEM_NOT_FOUND'
  // Value objects
  | 'ERR_NATIONAL_ID_LENGTH'
  | 'ERR_NATIONAL_ID_CHECKSUM'
  | 'ERR_MOBILE_INVALID'
  | 'ERR_PHONE_INVALID'
  // Jalali dates
  | 'ERR_DATE_EMPTY'
  | 'ERR_DATE_UNKNOWN_FORMAT'
  | 'ERR_DATE_NON_NUMERIC'
  | 'ERR_DATE_AMBIGUOUS_YEAR'
  | 'ERR_DATE_YEAR_OUT_OF_RANGE'
  | 'ERR_DATE_MONTH_INVALID'
  | 'ERR_DATE_DAY_INVALID'
  | 'ERR_DATE_NOT_ON_CALENDAR'
  // Catalogue
  | 'ERR_UNKNOWN_TREATMENT_CODE'
  | 'ERR_SORT_FIELD_UNSUPPORTED';

/** Values the API sends for interpolation, e.g. `{ fileNo: '11559' }`. */
export type ApiErrorParams = Readonly<Record<string, string | number>>;

/** The error body every endpoint returns. */
export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode | string;
  params: ApiErrorParams;
  /** English, for developers. Never shown to the user. */
  message: string;
  fieldErrors?: Record<string, Array<{ code: string; params: ApiErrorParams }>>;
  path: string;
  timestamp: string;
}
