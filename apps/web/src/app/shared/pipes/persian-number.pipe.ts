import { Pipe, PipeTransform } from '@angular/core';

/**
 * Render digits in Persian numerals (۰۱۲۳…), which is what the practice reads
 * on its paper charts. Applied to counts and dates; deliberately *not* applied
 * to phone numbers or national ids, which staff dictate and copy as Latin.
 */
@Pipe({ name: 'faNum', standalone: true })
export class PersianNumberPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
  }
}

/** Thousands-separated Persian numeral, for counts on the dashboard. */
@Pipe({ name: 'faCount', standalone: true })
export class PersianCountPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return value
      .toLocaleString('en-US')
      .replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
  }
}
