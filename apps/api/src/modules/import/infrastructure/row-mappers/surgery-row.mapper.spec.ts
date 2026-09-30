import { describe, expect, it } from '@jest/globals';

import { SURGERY_COLUMN, SurgeryRowMapper } from './surgery-row.mapper';
import { SheetRow } from '../../../../application/ports/workbook.port';
import { JalaliDate } from '../../../../domain';

/** A sheet row holding `cells`, keyed by the mapper's own column names. */
const row = (
  cells: Partial<Record<keyof typeof SURGERY_COLUMN, string>>,
): SheetRow => {
  const byColumn = new Map(
    Object.entries(cells).map(([name, value]) => [
      SURGERY_COLUMN[name as keyof typeof SURGERY_COLUMN] as number,
      value,
    ]),
  );
  return { rowNumber: 2, cell: (column) => byColumn.get(column) ?? '' };
};
const iso = (d: Date | null): string | null =>
  d ? JalaliDate.fromDate(d)!.toIsoDate() : null;
const on = (jalali: string): string => JalaliDate.parse(jalali).toIsoDate();

describe('SurgeryRowMapper — follow-up', () => {
  // "Now" is 9 Mehr 1405.
  const now = JalaliDate.parse('1405/07/09').date;
  const mapper = new SurgeryRowMapper();

  it('structures the month a note names, as the backfill does for existing rows', () => {
    const mapped = mapper.map(
      row({
        fullName: 'سارا رضایی',
        surgeryDate: '1405/06/01',
        prosthesisDue: 'آذر ماه',
      }),
      now,
    )!;
    expect(mapped.prosthesisDue).toBe('آذر ماه');
    expect(mapped.followUpMonths).toBe(3);
    expect(iso(mapped.followUpDate)).toBe(on('1405/09/01'));
    expect(mapped.followUpDoneAt).toBeNull();
    expect(mapped.followUpDoneInferred).toBe(false);
  });

  it('imports a past-due follow-up as done but unconfirmed', () => {
    const mapped = mapper.map(
      row({
        fullName: 'سارا رضایی',
        surgeryDate: '1405/01/15',
        prosthesisDue: 'تیر',
      }),
      now,
    )!;
    expect(iso(mapped.followUpDoneAt)).toBe(on('1405/04/15'));
    expect(mapped.followUpDoneInferred).toBe(true);
  });

  it('leaves the follow-up empty when the note or the surgery date cannot be read', () => {
    for (const cells of [
      { surgeryDate: '1405/06/01', prosthesisDue: 'بعداً' },
      { surgeryDate: 'نامعلوم', prosthesisDue: 'آذر' },
    ]) {
      const mapped = mapper.map(
        row({ fullName: 'سارا رضایی', ...cells }),
        now,
      )!;
      expect(mapped.followUpDate).toBeNull();
      expect(mapped.followUpDoneInferred).toBe(false);
    }
  });
});
