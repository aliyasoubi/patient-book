import type { ValidationErrors } from '@angular/forms';

/**
 * Default wording for the validator error keys used across this app's forms.
 *
 * This is the single place that decides what "required" or "not a valid
 * mobile number" reads as. A field atom (`PbTextField`, `PbSelectField`, …)
 * calls this before rendering `<mat-error>`, so changing a message here
 * changes it on every field in the app at once — which is the point of having
 * one field component instead of one hand-written `<mat-form-field>` per
 * screen.
 *
 * Built-in Angular validators (`required`, `maxlength`, `pattern`, …) are
 * covered here because their meaning is universal. A validator whose message
 * depends on which field it is attached to (e.g. two different `matches`
 * patterns) is passed per call site via the field's `errorMessages` input,
 * which takes priority over this default.
 */
function defaultMessage(key: string, error: unknown): string | null {
  switch (key) {
    case 'required':
      return $localize`:@@field.required:این مقدار الزامی است`;
    case 'maxlength': {
      const e = error as { requiredLength: number };
      return $localize`:@@field.maxlength:حداکثر ${e.requiredLength}:max: کاراکتر مجاز است`;
    }
    case 'minlength': {
      const e = error as { requiredLength: number };
      return $localize`:@@field.minlength:حداقل ${e.requiredLength}:min: کاراکتر لازم است`;
    }
    case 'pattern':
      return $localize`:@@field.patternInvalid:قالب واردشده معتبر نیست`;
    case 'email':
      return $localize`:@@field.emailInvalid:ایمیل معتبر نیست`;

    // Domain validators shared by more than one form (see shared/validators.ts).
    case 'mobile':
      return $localize`:@@field.mobileInvalid:شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد`;
    case 'nationalIdLength':
      return $localize`:@@field.nationalIdLength:کد ملی باید ۱۰ رقم باشد`;
    case 'nationalIdInvalid':
      return $localize`:@@field.nationalIdInvalid:کد ملی معتبر نیست (رقم کنترل نادرست است)`;
    case 'jalaliDate':
      return $localize`:@@field.jalaliDateInvalid:تاریخ شمسی معتبری نیست`;
    case 'mismatch':
      return $localize`:@@field.mismatch:دو مقدار وارد شده یکسان نیستند`;

    // A server rejection: the message was already rendered by
    // ApiErrorTranslator and stashed as the error's own value.
    case 'server':
      return typeof error === 'string' ? error : null;

    default:
      return null;
  }
}

/**
 * The message to show for a control's current error, if any.
 *
 * `overrides` lets one call site give a validator key field-specific wording
 * (e.g. a `matches` pattern that means something different on `fileNo` than
 * on `mobile`) without every other field having to know about it.
 */
export function firstErrorMessage(
  errors: ValidationErrors | null,
  overrides: Readonly<Record<string, string>> = {},
): string | null {
  if (!errors) return null;
  const key = Object.keys(errors)[0];
  if (!key) return null;
  return overrides[key] ?? defaultMessage(key, errors[key]) ?? null;
}
