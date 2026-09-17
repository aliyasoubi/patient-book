import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { ApiErrorBody, ApiErrorCode, ApiErrorParams } from './api-error-code';

/**
 * Turns the API's error codes into text a person can read.
 *
 * The API is deliberately locale-free: it reports *what* went wrong as a stable
 * code plus parameters, and this is the single place that decides how to say it.
 * Every string is resolved from the active JSON dictionary.
 */
@Injectable({ providedIn: 'root' })
export class ApiErrorTranslator {
  private readonly i18n = inject(TranslateService);

  private t(key: string, params: ApiErrorParams = {}): string {
    return this.i18n.instant(key, params);
  }

  /** The headline message for a failed request. */
  translate(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return this.unexpected();

    // A status of 0 means the request never reached the server at all.
    if (error.status === 0) {
      return this.t('error.network');
    }

    const body = error.error as ApiErrorBody | null;
    if (!body?.code) return this.unexpected();

    // A validation failure is best explained field by field.
    if (body.code === 'ERR_VALIDATION_FAILED' && body.fieldErrors) {
      const first = Object.entries(body.fieldErrors)[0];
      if (first) {
        const [field, failures] = first;
        return this.field(field, failures[0]?.code ?? '', failures[0]?.params ?? {});
      }
    }

    return this.forCode(body.code, body.params ?? {});
  }

  /** Message for one error code. Public so forms can render inline errors. */
  forCode(code: ApiErrorCode | string, params: ApiErrorParams = {}): string {
    switch (code as ApiErrorCode) {
      // -- Identity & access -------------------------------------------
      case 'ERR_INVALID_CREDENTIALS':
        return this.t('error.invalidCredentials');
      case 'ERR_ACCOUNT_DISABLED':
        return this.t('error.accountDisabled');
      case 'ERR_SESSION_EXPIRED':
        return this.t('error.sessionExpired');
      case 'ERR_SESSION_REVOKED':
        return this.t('error.sessionRevoked');
      case 'ERR_PASSWORD_CHANGE_REQUIRED':
        return this.t('error.passwordChangeRequired');
      case 'ERR_CURRENT_PASSWORD_WRONG':
        return this.t('error.currentPasswordWrong');
      case 'ERR_USERNAME_TAKEN':
        return this.t('error.usernameTaken');
      case 'ERR_CANNOT_DISABLE_SELF':
        return this.t('error.cannotDisableSelf');
      case 'ERR_CANNOT_DEMOTE_SELF':
        return this.t('error.cannotDemoteSelf');
      case 'ERR_CANNOT_DELETE_SELF':
        return this.t('error.cannotDeleteSelf');
      case 'ERR_UNAUTHORIZED':
        return this.t('error.unauthorized');
      case 'ERR_FORBIDDEN':
        return this.t('error.forbidden');
      case 'ERR_RATE_LIMITED':
        return this.t('error.rateLimited');

      // -- Records ------------------------------------------------------
      case 'ERR_PATIENT_NOT_FOUND':
        return params['fileNo']
          ? this.t('error.patientNotFoundWithFile', params)
          : this.t('error.patientNotFound');
      case 'ERR_FILE_NUMBER_TAKEN':
        return this.t('error.fileNumberTaken', params);
      case 'ERR_PATIENT_MODIFIED':
        return this.t('error.patientModified');
      case 'ERR_REGISTRY_CASE_NOT_FOUND':
        return params['registryNo']
          ? this.t('error.registryCaseNotFoundWithNo', params)
          : this.t('error.registryCaseNotFound');
      case 'ERR_REGISTRY_NUMBER_TAKEN':
        return this.t('error.registryNumberTaken', params);
      case 'ERR_SURGERY_ITEM_NOT_FOUND':
        return this.t('error.surgeryItemNotFound');
      case 'ERR_NOT_FOUND':
        return this.t('error.notFound');

      // -- Identifiers --------------------------------------------------
      case 'ERR_NATIONAL_ID_LENGTH':
        return this.t('error.nationalIdLength', params);
      case 'ERR_NATIONAL_ID_CHECKSUM':
        return this.t('error.nationalIdChecksum');
      case 'ERR_MOBILE_INVALID':
        return this.t('error.mobileInvalid');
      case 'ERR_PHONE_INVALID':
        return this.t('error.phoneInvalid');

      // -- Jalali dates -------------------------------------------------
      case 'ERR_DATE_EMPTY':
        return this.t('error.dateEmpty');
      case 'ERR_DATE_UNKNOWN_FORMAT':
        return this.t('error.dateUnknownFormat');
      case 'ERR_DATE_NON_NUMERIC':
        return this.t('error.dateNonNumeric');
      case 'ERR_DATE_AMBIGUOUS_YEAR':
        return this.t('error.dateAmbiguousYear');
      case 'ERR_DATE_YEAR_OUT_OF_RANGE':
        return this.t('error.dateYearOutOfRange', params);
      case 'ERR_DATE_MONTH_INVALID':
        return this.t('error.dateMonthInvalid', params);
      case 'ERR_DATE_DAY_INVALID':
        return this.t('error.dateDayInvalid', params);
      case 'ERR_DATE_NOT_ON_CALENDAR':
        return this.t('error.dateNotOnCalendar');

      // -- Catalogue ----------------------------------------------------
      case 'ERR_UNKNOWN_TREATMENT_CODE':
        return this.t('error.unknownTreatment', params);
      case 'ERR_SORT_FIELD_UNSUPPORTED':
        return this.t('error.sortUnsupported');


      default:
        return this.unexpected();
    }
  }

  /**
   * Message for one field-level validation failure.
   *
   * The API sends a constraint name — `matches`, `minLength`, `isNotEmpty` —
   * keyed by field path. The field is what makes the wording specific, so the
   * two are resolved together.
   */
  field(field: string, code: string, _params: ApiErrorParams = {}): string {
    const specific = this.fieldSpecific(field, code);
    if (specific) return specific;

    switch (code) {
      case 'isNotEmpty':
      case 'isDefined':
        return this.t('validation.required');
      case 'maxLength':
        return this.t('validation.maxLength');
      case 'minLength':
        return this.t('validation.minLength');
      case 'isEnum':
        return this.t('validation.enum');
      case 'isUuid':
        return this.t('validation.uuid');
      case 'isInt':
      case 'isNumber':
        return this.t('validation.number');
      case 'jalaliDate':
        return this.t('validation.jalaliDate');
      case 'nationalId':
        return this.t('validation.nationalId');
      default:
        // An unmapped constraint still deserves a usable sentence.
        return this.t('validation.generic');
    }
  }

  /** Wording that depends on which field failed, not just how. */
  private fieldSpecific(field: string, code: string): string | null {
    if (code !== 'matches') return null;
    switch (field) {
      case 'fileNo':
      case 'registryNo':
      case 'implantRegistryNo':
        return this.t('validation.fileNoDigits');
      case 'mobile':
        return this.t('validation.mobile');
      case 'homePhone':
        return this.t('validation.homePhone');
      case 'username':
        return this.t('validation.username');
      default:
        return null;
    }
  }

  private unexpected(): string {
    return this.t('error.unexpected');
  }
}
