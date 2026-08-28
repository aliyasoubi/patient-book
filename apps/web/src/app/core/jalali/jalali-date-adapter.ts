import { Injectable, inject } from '@angular/core';
import { DateAdapter, MAT_DATE_LOCALE, MatDateFormats } from '@angular/material/core';
import { TranslateService } from '@ngx-translate/core';
import {
  addDays,
  addMonths,
  addYears,
  format,
  getDate,
  getDay,
  getDaysInMonth,
  getMonth,
  getYear,
  isValid,
  newDate,
  parse,
  startOfDay,
} from 'date-fns-jalali';

export const JALALI_MONTH_KEYS = [
  'month.farvardin',
  'month.ordibehesht',
  'month.khordad',
  'month.tir',
  'month.mordad',
  'month.shahrivar',
  'month.mehr',
  'month.aban',
  'month.azar',
  'month.dey',
  'month.bahman',
  'month.esfand',
] as const;

/**
 * Weekday names indexed by the JavaScript day number (0 = Sunday), which is
 * what `Date.getDay()` returns — not by the Persian week, which starts on
 * Saturday. Getting this mapping backwards silently mislabels every column of
 * the calendar header.
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Saturday, in JavaScript's numbering. The Iranian week starts here. */
const SATURDAY = 6;

/**
 * A `DateAdapter` that presents the Jalali (Shamsi) calendar while keeping the
 * underlying value a plain `Date`.
 *
 * The practice records every date in Jalali, so the picker must count months
 * the Jalali way — the first six have 31 days, the next five have 30, and
 * Esfand has 29 or 30 depending on the leap year. Deriving those from the
 * Gregorian date would be wrong roughly half the time.
 */
@Injectable()
export class JalaliDateAdapter extends DateAdapter<Date> {
  private readonly i18n = inject(TranslateService);

  constructor() {
    super();
    this.setLocale(inject(MAT_DATE_LOCALE, { optional: true }) ?? 'fa-IR');
  }

  override getYear(date: Date): number {
    return getYear(date);
  }

  override getMonth(date: Date): number {
    return getMonth(date);
  }

  override getDate(date: Date): number {
    return getDate(date);
  }

  override getDayOfWeek(date: Date): number {
    return getDay(date);
  }

  override getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    // Persian month names have no conventional abbreviation; the full name is
    // short enough to use at every size.
    const months = JALALI_MONTH_KEYS.map((key) => this.i18n.instant(key));
    return style === 'narrow' ? months.map((m) => m.slice(0, 3)) : months;
  }

  override getDateNames(): string[] {
    // 31 slots: the picker asks for the maximum any month could hold.
    return Array.from({ length: 31 }, (_, i) => this.toPersianNumerals(String(i + 1)));
  }

  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    const prefix = style === 'long' ? 'day' : style === 'short' ? 'dayShort' : 'dayNarrow';
    return WEEKDAYS.map((day) => this.i18n.instant(`${prefix}.${day}`));
  }

  override getYearName(date: Date): string {
    return this.toPersianNumerals(String(getYear(date)));
  }

  override getFirstDayOfWeek(): number {
    return SATURDAY;
  }

  override getNumDaysInMonth(date: Date): number {
    return getDaysInMonth(date);
  }

  override clone(date: Date): Date {
    return new Date(date.getTime());
  }

  /** `month` is 0-based, matching the rest of the adapter contract. */
  override createDate(year: number, month: number, date: number): Date {
    if (month < 0 || month > 11) {
      throw Error(`Invalid Jalali month: ${month + 1}`);
    }
    if (date < 1) {
      throw Error(`Invalid Jalali day: ${date}`);
    }
    const result = newDate(year, month, date);
    // Guard against day 31 in a 30-day Jalali month rolling into the next one.
    if (getMonth(result) !== month) {
      throw Error(`Day ${date} does not exist in Jalali month ${month + 1}`);
    }
    return result;
  }

  override today(): Date {
    return startOfDay(new Date());
  }

  /**
   * Accept what a receptionist actually types: `1404/6/11`, `1404-06-11`, or
   * the same with Persian digits.
   */
  override parse(value: unknown, _parseFormat?: unknown): Date | null {
    if (value instanceof Date) return this.clone(value);
    if (typeof value === 'number') return new Date(value);
    if (typeof value !== 'string' || !value.trim()) return null;

    const normalized = this.toLatinNumerals(value).trim().replace(/[-.]/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return this.invalid();

    const [y, m, d] = parts.map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return this.invalid();

    const parsed = parse(
      `${String(y).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`,
      'yyyy/MM/dd',
      new Date(),
    );
    return isValid(parsed) ? parsed : this.invalid();
  }

  override format(date: Date, displayFormat: string): string {
    if (!this.isValid(date)) return '';
    return this.toPersianNumerals(format(date, displayFormat));
  }

  override addCalendarYears(date: Date, years: number): Date {
    return addYears(date, years);
  }

  override addCalendarMonths(date: Date, months: number): Date {
    return addMonths(date, months);
  }

  override addCalendarDays(date: Date, days: number): Date {
    return addDays(date, days);
  }

  /**
   * Serialised form. Deliberately the **Jalali** `yyyy/MM/dd` string, because
   * that is what the API stores and echoes back; emitting a Gregorian ISO
   * string here would round-trip the wrong calendar.
   */
  override toIso8601(date: Date): string {
    return format(date, 'yyyy/MM/dd');
  }

  override deserialize(value: unknown): Date | null {
    if (typeof value === 'string' && value.includes('/')) return this.parse(value);
    return super.deserialize(value);
  }

  override isDateInstance(obj: unknown): boolean {
    return obj instanceof Date;
  }

  override isValid(date: Date): boolean {
    return isValid(date);
  }

  override invalid(): Date {
    return new Date(NaN);
  }

  // -- numerals ---------------------------------------------------------

  /** Persian digits are what the practice reads on paper; use them on screen. */
  private toPersianNumerals(input: string): string {
    return input.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
  }

  private toLatinNumerals(input: string): string {
    return input.replace(/[۰-۹٠-٩]/g, (ch) => {
      const code = ch.charCodeAt(0);
      const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
      return String(code - base);
    });
  }
}

/** Display and parse formats for the Jalali picker. */
export const JALALI_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'yyyy/MM/dd',
  },
  display: {
    dateInput: 'yyyy/MM/dd',
    monthYearLabel: 'MMMM yyyy',
    dateA11yLabel: 'd MMMM yyyy',
    monthYearA11yLabel: 'MMMM yyyy',
  },
};
