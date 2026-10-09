import { HttpErrorResponse } from '@angular/common/http';
import type { AbstractControl } from '@angular/forms';

import type { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import type { ApiErrorBody } from '../../core/i18n/api-error-code';

/**
 * Put a refused save where the person is looking: a field the API named goes
 * under that field, anything else is returned for the dialog's own banner.
 * `codeFields` pins an error code with no field of its own — "this item
 * already exists" — to the field that caused it.
 */
export function showOnFields(
  error: unknown,
  errors: ApiErrorTranslator,
  fields: Readonly<Record<string, AbstractControl | undefined>>,
  codeFields: Readonly<Record<string, string>> = {},
): string | null {
  if (!(error instanceof HttpErrorResponse)) return errors.translate(error);
  const body = error.error as ApiErrorBody | null;
  let shown = false;
  for (const [field, failures] of Object.entries(body?.fieldErrors ?? {})) {
    const control = fields[field];
    if (!control || !failures[0]) continue;
    control.setErrors({
      server: errors.field(field, failures[0].code, failures[0].params),
    });
    control.markAsTouched();
    shown = true;
  }
  const pinned = body?.code ? fields[codeFields[body.code] ?? ''] : undefined;
  if (pinned) {
    pinned.setErrors({ server: errors.translate(error) });
    pinned.markAsTouched();
    shown = true;
  }
  return shown ? null : errors.translate(error);
}
