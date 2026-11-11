import { Pipe, PipeTransform } from '@angular/core';

import { toLatinDigits } from '../validators';

/**
 * A phone number grouped the way it is read aloud, so it can be taken in at
 * a glance and dictated without counting digits:
 *
 *   mobile    09121234567  → 0912 123 4567
 *   landline  02122345678  → 021 2234 5678
 *
 * Anything else (an extension, a number abroad, a typo) is left as stored.
 * Only the spacing changes: the digits stay ASCII, so the app's font draws
 * them in Persian and a `tel:` link built from the stored value still works.
 * The groups are joined by no-break spaces, so a number never wraps across
 * two lines in a narrow column. Show it in an LTR-isolated element
 * (`dir="ltr"` or `.ltr-nums`).
 */
/** A no-break space: groups stay on one line. */
const NBSP = String.fromCharCode(0xa0);

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) {
    return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)].join(NBSP);
  }
  if (/^0[1-8]\d{9}$/.test(digits)) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)].join(NBSP);
  }
  return value;
}

@Pipe({ name: 'phone', standalone: true })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatPhone(value);
  }
}
