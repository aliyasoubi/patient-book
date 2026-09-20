import { format, isValid, parse } from 'date-fns-jalali';
import { InvalidInputError } from '../errors/domain.error';
import { ErrorCode, ErrorParams } from '../errors/error-code';
import { toLatinDigits } from '../services/persian-text';

/**
 * How much of a date the source actually told us.
 *
 * Handwritten birth dates are commonly recorded as a bare year ("۱۳۶۸").
 * Collapsing those to a full date would assert a birthday nobody ever wrote
 * down, so the precision travels with the value.
 */
export type DatePrecision = 'day' | 'month' | 'year';

/** Why a string could not be read as a Jalali date. */
export interface JalaliParseFailure {
  readonly code: ErrorCode;
  readonly params: ErrorParams;
}

/** Jalali years this practice's records could plausibly span. */
const MIN_YEAR = 1250;
const MAX_YEAR = 1500;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A `date` column's value as a local-calendar `Date`.
 *
 * TypeORM hands `date` columns back as `YYYY-MM-DD` strings, and
 * `new Date('YYYY-MM-DD')` reads that as UTC midnight — which on any host
 * west of Greenwich is still the previous local day, so 1404/07/01 came out
 * as 1404/06/31. Reading the three components directly makes the result
 * independent of the server's timezone. Anything else — a `Date` already, or
 * a full timestamp string — is passed through unchanged.
 */
export function storedDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const match = DATE_ONLY.exec(value);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * A date on the Jalali (Shamsi) calendar, carrying the precision it was
 * recorded at.
 *
 * The practice writes every date in Jalali, so this is the domain's native date
 * type; the Gregorian `Date` underneath is an implementation detail exposed only
 * for storage and sorting. Month lengths differ from the Gregorian calendar —
 * the first six have 31 days, the next five 30, and Esfand 29 or 30 by leap
 * year — so arithmetic must go through the calendar, never through day counts.
 */
export class JalaliDate {
  private constructor(
    /** Gregorian instant for the anchor day (first day of the known period). */
    readonly date: Date,
    readonly precision: DatePrecision,
  ) {}

  /**
   * Parse the free-form Jalali text found in the practice's spreadsheets:
   * `1368`, `1368/5`, `1368/5/12`, `99/05/15`, `1404-06-11`, and the
   * Persian-digit and whitespace variants of each.
   *
   * @throws InvalidInputError describing which rule the input broke.
   */
  static parse(input: string | null | undefined): JalaliDate {
    const result = JalaliDate.tryParse(input);
    if (result instanceof JalaliDate) return result;
    throw new InvalidInputError(
      result.code,
      result.params,
      `Cannot read "${input}" as a Jalali date (${result.code})`,
    );
  }

  /**
   * Non-throwing variant. Returns the reason on failure so an import can record
   * exactly why a value was rejected instead of discarding it.
   */
  static tryParse(
    input: string | null | undefined,
  ): JalaliDate | JalaliParseFailure {
    if (input === null || input === undefined) {
      return { code: ErrorCode.DateEmpty, params: {} };
    }

    const raw = toLatinDigits(String(input)).trim().replace(/\s+/g, '');
    if (!raw || raw === '_' || raw === '-') {
      return { code: ErrorCode.DateEmpty, params: {} };
    }

    const parts = raw.split(/[/\-.]/).filter((p) => p !== '');
    if (parts.length === 0 || parts.length > 3) {
      return {
        code: ErrorCode.DateUnknownFormat,
        params: { value: String(input) },
      };
    }
    if (parts.some((p) => !/^\d+$/.test(p))) {
      return {
        code: ErrorCode.DateNonNumeric,
        params: { value: String(input) },
      };
    }

    const nums = parts.map(Number);
    const year = JalaliDate.expandYear(nums[0]);
    if (year === 'ambiguous') {
      return {
        code: ErrorCode.DateAmbiguousYear,
        params: { value: String(input) },
      };
    }
    if (year === 'out-of-range' || year < MIN_YEAR || year > MAX_YEAR) {
      return {
        code: ErrorCode.DateYearOutOfRange,
        params: { year: nums[0], value: String(input) },
      };
    }

    if (nums.length === 1) return JalaliDate.build(year, 1, 1, 'year', input);

    const month = nums[1];
    if (month < 1 || month > 12) {
      return {
        code: ErrorCode.DateMonthInvalid,
        params: { month, value: String(input) },
      };
    }
    if (nums.length === 2)
      return JalaliDate.build(year, month, 1, 'month', input);

    const day = nums[2];
    if (day < 1 || day > 31) {
      return {
        code: ErrorCode.DateDayInvalid,
        params: { day, value: String(input) },
      };
    }
    return JalaliDate.build(year, month, day, 'day', input);
  }

  /** True when the value is a real date on the Jalali calendar. */
  static isValid(input: string | null | undefined): boolean {
    return JalaliDate.tryParse(input) instanceof JalaliDate;
  }

  /** Wrap an already-stored Gregorian date, e.g. one read back from a column. */
  static fromDate(
    date: Date,
    precision: DatePrecision = 'day',
  ): JalaliDate | null {
    return isValid(date) ? new JalaliDate(date, precision) : null;
  }

  /** Wrap a value read back from a `date` column — see {@link storedDate}. */
  static fromStored(
    value: Date | string,
    precision: DatePrecision = 'day',
  ): JalaliDate | null {
    return JalaliDate.fromDate(storedDate(value), precision);
  }

  static today(): JalaliDate {
    return new JalaliDate(new Date(), 'day');
  }

  /**
   * Expand a two-digit year. The practice's records run 1399–1405, and the
   * shorthand in the sheets ("99/05/15") always means the nearest century.
   */
  private static expandYear(
    raw: number,
  ): number | 'ambiguous' | 'out-of-range' {
    if (raw >= MIN_YEAR && raw <= MAX_YEAR) return raw;
    if (raw < 100) return raw >= 50 ? 1300 + raw : 1400 + raw;
    // A three-digit value such as "140" is genuinely ambiguous between 1400 and
    // 1409. Refusing beats guessing at a patient's date of birth.
    if (raw < 1000) return 'ambiguous';
    // Four digits but implausible — almost always a Gregorian year that strayed
    // into a Jalali column. Naming that is more useful than "ambiguous".
    return 'out-of-range';
  }

  private static build(
    y: number,
    m: number,
    d: number,
    precision: DatePrecision,
    original: unknown,
  ): JalaliDate | JalaliParseFailure {
    const stamp = `${String(y).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    const parsed = parse(stamp, 'yyyy/MM/dd', new Date());
    if (!isValid(parsed)) {
      // Reaching here means the components were individually plausible but the
      // combination is not a real day — 31 Azar, or 30 Esfand in a common year.
      return {
        code: ErrorCode.DateNotOnCalendar,
        params: { value: String(original), normalised: stamp },
      };
    }
    return new JalaliDate(parsed, precision);
  }

  /** Canonical Jalali rendering, trimmed to the precision actually known. */
  format(): string {
    switch (this.precision) {
      case 'year':
        return format(this.date, 'yyyy');
      case 'month':
        return format(this.date, 'yyyy/MM');
      default:
        return format(this.date, 'yyyy/MM/dd');
    }
  }

  /**
   * `YYYY-MM-DD` from the **local** calendar components.
   *
   * `toISOString().slice(0, 10)` is the obvious thing to write and is wrong: it
   * converts to UTC first, so on any host east of Greenwich a date stored at
   * local midnight comes back a day earlier. Tehran is UTC+3:30, which would
   * shift every date in the register by one day.
   */
  toIsoDate(): string {
    const y = this.date.getFullYear();
    const m = String(this.date.getMonth() + 1).padStart(2, '0');
    const d = String(this.date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Age in whole years, or `null` when the result is not plausible. */
  ageInYears(now: Date = new Date()): number | null {
    let age = now.getFullYear() - this.date.getFullYear();
    const monthDelta = now.getMonth() - this.date.getMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && now.getDate() < this.date.getDate())
    )
      age--;
    return age >= 0 && age < 130 ? age : null;
  }

  isBefore(other: Date): boolean {
    return this.date.getTime() < other.getTime();
  }

  toString(): string {
    return this.format();
  }
}
