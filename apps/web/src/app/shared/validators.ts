import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Persian (U+06F0–U+06F9) and Arabic-Indic (U+0660–U+0669) digits to ASCII.
 *
 * A Persian keyboard emits `۰۹۱۲…` for what the receptionist reads as
 * `0912…`. Every identifier field folds before it validates and before it is
 * sent, so the API — which folds again and is the side that decides — never
 * sees a number it would reject only because of the script it was typed in.
 */
export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** An identifier as the form should send it: digits folded, blank as `null`. */
export function identifierValue(raw: string): string | null {
  const folded = toLatinDigits(raw).trim();
  return folded ? folded : null;
}

/**
 * `Validators.pattern(/^\d{min,max}$/)`, except that Persian digits count as
 * digits. Reports the same `pattern` key so field wording is unchanged.
 */
export function digitString(min: number, max: number): ValidatorFn {
  const pattern = new RegExp(`^\\d{${min},${max}}$`);
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value as string | null;
    if (!raw) return null;
    return pattern.test(toLatinDigits(String(raw))) ? null : { pattern: true };
  };
}

/**
 * Iranian national identifier (کد ملی), validated by its check digit rather
 * than by length alone — a ten-digit string that fails the checksum is a typo,
 * not an id. Mirrors the server-side rule so the user sees it before saving.
 */
export function iranianNationalId(control: AbstractControl): ValidationErrors | null {
  const raw = control.value as string | null;
  if (!raw) return null;

  const id = toLatinDigits(String(raw)).trim();
  if (!/^\d{10}$/.test(id)) return { nationalIdLength: true };
  if (/^(\d)\1{9}$/.test(id)) return { nationalIdInvalid: true };

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(id[i]) * (10 - i);
  const remainder = sum % 11;
  const check = Number(id[9]);
  const valid = remainder < 2 ? check === remainder : check === 11 - remainder;
  return valid ? null : { nationalIdInvalid: true };
}

/** Iranian mobile number in local `09xxxxxxxxx` form. */
export function iranianMobile(control: AbstractControl): ValidationErrors | null {
  const raw = control.value as string | null;
  if (!raw) return null;
  return /^09\d{9}$/.test(toLatinDigits(String(raw)).trim()) ? null : { mobile: true };
}
