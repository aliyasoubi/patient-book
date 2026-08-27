import { AbstractControl, ValidationErrors } from '@angular/forms';

const toLatin = (s: string): string =>
  s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });

/**
 * Iranian national identifier (کد ملی), validated by its check digit rather
 * than by length alone — a ten-digit string that fails the checksum is a typo,
 * not an id. Mirrors the server-side rule so the user sees it before saving.
 */
export function iranianNationalId(control: AbstractControl): ValidationErrors | null {
  const raw = control.value as string | null;
  if (!raw) return null;

  const id = toLatin(String(raw)).replace(/\D/g, '');
  if (id.length !== 10) return { nationalIdLength: true };
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
  const digits = toLatin(String(raw)).replace(/\D/g, '');
  return /^09\d{9}$/.test(digits) ? null : { mobile: true };
}
