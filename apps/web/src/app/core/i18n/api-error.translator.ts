import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { ApiErrorBody, ApiErrorCode, ApiErrorParams } from './api-error-code';

/**
 * Turns the API's error codes into text a person can read.
 *
 * The API is deliberately locale-free: it reports *what* went wrong as a stable
 * code plus parameters, and this is the single place that decides how to say it.
 * Every string goes through `$localize`, so the wording is extracted with the
 * rest of the app's text and can be translated without touching the server.
 */
@Injectable({ providedIn: 'root' })
export class ApiErrorTranslator {
  /** The headline message for a failed request. */
  translate(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return this.unexpected();

    // A status of 0 means the request never reached the server at all.
    if (error.status === 0) {
      return $localize`:@@error.network:ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.`;
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
        return $localize`:@@error.invalidCredentials:نام کاربری یا رمز عبور نادرست است.`;
      case 'ERR_ACCOUNT_DISABLED':
        return $localize`:@@error.accountDisabled:این حساب کاربری غیرفعال شده است.`;
      case 'ERR_SESSION_EXPIRED':
        return $localize`:@@error.sessionExpired:نشست شما منقضی شده است. دوباره وارد شوید.`;
      case 'ERR_SESSION_REVOKED':
        return $localize`:@@error.sessionRevoked:نشست شما باطل شده است. دوباره وارد شوید.`;
      case 'ERR_CURRENT_PASSWORD_WRONG':
        return $localize`:@@error.currentPasswordWrong:رمز عبور فعلی نادرست است.`;
      case 'ERR_USERNAME_TAKEN':
        return $localize`:@@error.usernameTaken:این نام کاربری قبلاً ثبت شده است.`;
      case 'ERR_CANNOT_DISABLE_SELF':
        return $localize`:@@error.cannotDisableSelf:نمی‌توانید حساب خودتان را غیرفعال کنید.`;
      case 'ERR_CANNOT_DEMOTE_SELF':
        return $localize`:@@error.cannotDemoteSelf:نمی‌توانید نقش مدیریتی خودتان را تغییر دهید.`;
      case 'ERR_CANNOT_DELETE_SELF':
        return $localize`:@@error.cannotDeleteSelf:نمی‌توانید حساب خودتان را حذف کنید.`;
      case 'ERR_UNAUTHORIZED':
        return $localize`:@@error.unauthorized:برای انجام این کار باید وارد شوید.`;
      case 'ERR_FORBIDDEN':
        return $localize`:@@error.forbidden:برای این عملیات دسترسی کافی ندارید.`;
      case 'ERR_RATE_LIMITED':
        return $localize`:@@error.rateLimited:تعداد درخواست‌ها زیاد است. کمی صبر کنید.`;

      // -- Records ------------------------------------------------------
      case 'ERR_PATIENT_NOT_FOUND':
        return params['fileNo']
          ? $localize`:@@error.patientNotFoundWithFile:پرونده ${params['fileNo']}:fileNo: پیدا نشد.`
          : $localize`:@@error.patientNotFound:پرونده بیمار پیدا نشد.`;
      case 'ERR_FILE_NUMBER_TAKEN':
        return $localize`:@@error.fileNumberTaken:شماره پرونده ${params['fileNo']}:fileNo: قبلاً ثبت شده است.`;
      case 'ERR_REGISTRY_CASE_NOT_FOUND':
        return params['registryNo']
          ? $localize`:@@error.registryCaseNotFoundWithNo:شماره ${params['registryNo']}:registryNo: در این دفتر وجود ندارد.`
          : $localize`:@@error.registryCaseNotFound:پرونده در این دفتر پیدا نشد.`;
      case 'ERR_REGISTRY_NUMBER_TAKEN':
        return $localize`:@@error.registryNumberTaken:شماره ${params['registryNo']}:registryNo: در این دفتر قبلاً ثبت شده است.`;
      case 'ERR_SURGERY_ITEM_NOT_FOUND':
        return $localize`:@@error.surgeryItemNotFound:ردیف لیست جراحی پیدا نشد.`;
      case 'ERR_NOT_FOUND':
        return $localize`:@@error.notFound:رکورد مورد نظر پیدا نشد.`;

      // -- Identifiers --------------------------------------------------
      case 'ERR_NATIONAL_ID_LENGTH':
        return $localize`:@@error.nationalIdLength:کد ملی باید ۱۰ رقم باشد (${params['length']}:length: رقم ثبت شده).`;
      case 'ERR_NATIONAL_ID_CHECKSUM':
        return $localize`:@@error.nationalIdChecksum:کد ملی معتبر نیست؛ رقم کنترل آن نادرست است.`;
      case 'ERR_MOBILE_INVALID':
        return $localize`:@@error.mobileInvalid:شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.`;
      case 'ERR_PHONE_INVALID':
        return $localize`:@@error.phoneInvalid:شماره تلفن معتبر نیست.`;

      // -- Jalali dates -------------------------------------------------
      case 'ERR_DATE_EMPTY':
        return $localize`:@@error.dateEmpty:تاریخ وارد نشده است.`;
      case 'ERR_DATE_UNKNOWN_FORMAT':
        return $localize`:@@error.dateUnknownFormat:قالب تاریخ شناخته نشد.`;
      case 'ERR_DATE_NON_NUMERIC':
        return $localize`:@@error.dateNonNumeric:تاریخ باید فقط شامل رقم باشد.`;
      case 'ERR_DATE_AMBIGUOUS_YEAR':
        return $localize`:@@error.dateAmbiguousYear:سال تاریخ مبهم است؛ آن را کامل بنویسید.`;
      case 'ERR_DATE_YEAR_OUT_OF_RANGE':
        return $localize`:@@error.dateYearOutOfRange:سال ${params['year']}:year: خارج از محدودهٔ تقویم شمسی است.`;
      case 'ERR_DATE_MONTH_INVALID':
        return $localize`:@@error.dateMonthInvalid:ماه ${params['month']}:month: معتبر نیست؛ ماه باید بین ۱ تا ۱۲ باشد.`;
      case 'ERR_DATE_DAY_INVALID':
        return $localize`:@@error.dateDayInvalid:روز ${params['day']}:day: معتبر نیست.`;
      case 'ERR_DATE_NOT_ON_CALENDAR':
        return $localize`:@@error.dateNotOnCalendar:این روز در تقویم شمسی وجود ندارد.`;

      // -- Catalogue ----------------------------------------------------
      case 'ERR_UNKNOWN_TREATMENT_CODE':
        return $localize`:@@error.unknownTreatment:درمان ناشناخته: ${params['codes']}:codes:`;
      case 'ERR_SORT_FIELD_UNSUPPORTED':
        return $localize`:@@error.sortUnsupported:مرتب‌سازی بر اساس این ستون پشتیبانی نمی‌شود.`;

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
  field(field: string, code: string, params: ApiErrorParams = {}): string {
    const specific = this.fieldSpecific(field, code);
    if (specific) return specific;

    switch (code) {
      case 'isNotEmpty':
      case 'isDefined':
        return $localize`:@@validation.required:این مقدار الزامی است.`;
      case 'maxLength':
        return $localize`:@@validation.maxLength:این مقدار طولانی‌تر از حد مجاز است.`;
      case 'minLength':
        return $localize`:@@validation.minLength:این مقدار کوتاه‌تر از حد مجاز است.`;
      case 'isEnum':
        return $localize`:@@validation.enum:مقدار انتخاب‌شده معتبر نیست.`;
      case 'isUuid':
        return $localize`:@@validation.uuid:شناسه معتبر نیست.`;
      case 'isInt':
      case 'isNumber':
        return $localize`:@@validation.number:این مقدار باید عدد باشد.`;
      case 'jalaliDate':
        return $localize`:@@validation.jalaliDate:تاریخ شمسی معتبری نیست.`;
      case 'nationalId':
        return $localize`:@@validation.nationalId:کد ملی معتبر نیست.`;
      default:
        // An unmapped constraint still deserves a usable sentence.
        return $localize`:@@validation.generic:مقدار واردشده معتبر نیست.`;
    }
  }

  /** Wording that depends on which field failed, not just how. */
  private fieldSpecific(field: string, code: string): string | null {
    if (code !== 'matches') return null;
    switch (field) {
      case 'fileNo':
      case 'registryNo':
      case 'implantRegistryNo':
        return $localize`:@@validation.fileNoDigits:شماره پرونده باید فقط رقم باشد.`;
      case 'mobile':
        return $localize`:@@validation.mobile:شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.`;
      case 'homePhone':
        return $localize`:@@validation.homePhone:شماره تلفن معتبر نیست.`;
      case 'username':
        return $localize`:@@validation.username:نام کاربری فقط می‌تواند شامل حروف انگلیسی، رقم، نقطه، خط تیره و زیرخط باشد.`;
      default:
        return null;
    }
  }

  private unexpected(): string {
    return $localize`:@@error.unexpected:خطای غیرمنتظره‌ای رخ داد.`;
  }
}
