import type { ValidationErrors } from '@angular/forms';
import type { TranslateService } from '@ngx-translate/core';

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
function defaultMessage(key: string, error: unknown, i18n: TranslateService): string | null {
  switch (key) {
    case 'required':
      return i18n.instant('field.required');
    case 'maxlength': {
      const e = error as { requiredLength: number };
      return i18n.instant('field.maxlength', { max: e.requiredLength });
    }
    case 'minlength': {
      const e = error as { requiredLength: number };
      return i18n.instant('field.minlength', { min: e.requiredLength });
    }
    case 'pattern':
      return i18n.instant('field.patternInvalid');
    case 'email':
      return i18n.instant('field.emailInvalid');

    // Domain validators shared by more than one form (see shared/validators.ts).
    case 'mobile':
      return i18n.instant('field.mobileInvalid');
    case 'nationalIdLength':
      return i18n.instant('field.nationalIdLength');
    case 'nationalIdInvalid':
      return i18n.instant('field.nationalIdInvalid');
    case 'jalaliDate':
    // Angular Material's own datepicker sets this when the typed text doesn't
    // parse — a date field is the one place users are expected to type
    // free-form, so this is the common case, not an edge case.
    case 'matDatepickerParse':
      return i18n.instant('field.jalaliDateInvalid');
    case 'mismatch':
      return i18n.instant('field.mismatch');

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
  i18n: TranslateService,
  overrides: Readonly<Record<string, string>> = {},
): string | null {
  if (!errors) return null;
  const key = Object.keys(errors)[0];
  if (!key) return null;
  return overrides[key] ?? defaultMessage(key, errors[key], i18n) ?? null;
}
