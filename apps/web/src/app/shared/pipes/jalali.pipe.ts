import { Pipe, PipeTransform } from '@angular/core';
import type { JalaliValue } from '../../core/models/patient.model';
import { JALALI_MONTHS } from '../../core/jalali/jalali-date-adapter';

/** Month names come from the date adapter, so the two never disagree. */
function monthName(index: number): string {
  return JALALI_MONTHS()[index] ?? String(index + 1);
}

const toPersian = (s: string): string =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

/**
 * Display a date at the precision the record actually holds.
 *
 * Roughly half the birth dates in the practice's book are a bare year. Padding
 * those to `۱۳۶۸/۰۱/۰۱` would assert a birthday nobody recorded, so a
 * year-precision value renders as just the year.
 */
@Pipe({ name: 'jalali', standalone: true })
export class JalaliPipe implements PipeTransform {
  transform(
    value: JalaliValue | null | undefined,
    style: 'numeric' | 'long' = 'numeric',
  ): string {
    if (!value?.jalali) return '—';
    if (style === 'numeric') return toPersian(value.jalali);

    const [y, m, d] = value.jalali.split('/');
    if (value.precision === 'year' || !m) return toPersian(y);
    const name = monthName(Number(m) - 1);
    if (value.precision === 'month' || !d) return `${name} ${toPersian(y)}`;
    return `${toPersian(String(Number(d)))} ${name} ${toPersian(y)}`;
  }
}
