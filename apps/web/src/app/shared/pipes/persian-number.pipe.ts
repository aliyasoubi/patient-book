import { Pipe, PipeTransform } from '@angular/core';

export function formatPersianNumber(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));
}

export function formatPersianCount(value: number): string {
  return formatPersianNumber(value.toLocaleString('en-US'));
}

/**
 * Render digits in Persian numerals (۰۱۲۳…), which is what the practice reads
 * on its paper charts. Applied to counts and dates so the *text* is Persian
 * (screen readers, copy/paste). Phone numbers, national ids and file numbers
 * are left as Latin text — staff dictate and copy them that way — and get
 * their Persian look from the Farsi-Digits build of Vazirmatn (`fonts/vazirmatn.css`).
 */
@Pipe({ name: 'faNum', standalone: true })
export class PersianNumberPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    return formatPersianNumber(value);
  }
}

/** Thousands-separated Persian numeral, for counts on the dashboard. */
@Pipe({ name: 'faCount', standalone: true })
export class PersianCountPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return formatPersianCount(value);
  }
}
