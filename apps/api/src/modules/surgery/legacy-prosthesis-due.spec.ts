import { describe, expect, it } from '@jest/globals';

import { legacyFollowUpMonths } from './legacy-prosthesis-due';
import { JalaliDate } from '../../domain';

const on = (jalali: string): Date => JalaliDate.parse(jalali).date;

describe('legacyFollowUpMonths', () => {
  it('reads a month name as months after the surgery', () => {
    expect(legacyFollowUpMonths('مهر', on('1405/04/09'))).toBe(3);
    expect(legacyFollowUpMonths('دی ماه', on('1404/07/15'))).toBe(3);
  });

  it('wraps into the next year, and takes the same month to mean a year on', () => {
    expect(legacyFollowUpMonths('فروردین ماه', on('1404/12/02'))).toBe(1);
    expect(legacyFollowUpMonths('تیر', on('1405/04/09'))).toBe(12);
  });

  it('tolerates the spellings the sheets used', () => {
    expect(legacyFollowUpMonths('اواخر آذر', on('1405/06/01'))).toBe(3);
    expect(legacyFollowUpMonths('فرودین ماه', on('1404/10/10'))).toBe(3);
    expect(legacyFollowUpMonths('آبان ماه', on('1405/06/01'))).toBe(2);
  });

  it('gives up on a note that names no month', () => {
    expect(legacyFollowUpMonths('بعداً', on('1405/06/01'))).toBeNull();
  });
});
