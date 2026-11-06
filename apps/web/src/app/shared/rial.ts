import type { AbstractControl, ValidationErrors } from '@angular/forms';

import { toLatinDigits } from './validators';

/** Whole rials; ten digits is already far past any price. */
const RIAL = /^\d{1,10}$/;

/** What was typed, in ASCII digits, without the separators either keyboard adds. */
const plain = (typed: string): string => toLatinDigits(typed).replace(/[\s,،٬]/g, '');

const inThrees = (digits: string): string =>
  digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+$)/g, ',');

/** A stored price as its field shows it: `1,250,000`. */
export function rialInput(rial: number | null | undefined): string {
  return rial === null || rial === undefined ? '' : inThrees(String(rial));
}

/** What a price field holds, in rials; null while it is empty or no number. */
export function rialValue(typed: string): number | null {
  const digits = plain(typed);
  return RIAL.test(digits) ? Number(digits) : null;
}

/** Digits in either script, with or without their commas. Empty passes. */
export function rialValid(control: AbstractControl<string>): ValidationErrors | null {
  const digits = plain(control.value ?? '');
  return !digits || RIAL.test(digits) ? null : { pattern: true };
}

/**
 * A field's text with its digits grouped in threes, and where the caret then
 * belongs: before the same digits as it was, so correcting one in the middle
 * of a price does not throw the next to the end. Never just after a comma,
 * where Backspace would only remove the comma and have it put straight back.
 * What is not a number is left as typed, for the validator to refuse.
 */
export function regroup(typed: string, caret: number): { value: string; caret: number } {
  const digits = plain(typed);
  if (!/^\d+$/.test(digits)) return { value: typed, caret };
  const value = inThrees(digits);
  let after = plain(typed.slice(caret)).length;
  let at = value.length;
  while (after > 0 && at > 0) {
    at--;
    if (value[at] !== ',') after--;
  }
  return { value, caret: value[at - 1] === ',' ? at - 1 : at };
}
