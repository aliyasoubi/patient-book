import { InvalidInputError } from '../errors/domain.error';
import { ErrorCode } from '../errors/error-code';
import { toLatinDigits } from '../services/persian-text';

/** Shortest value still treated as a code with its leading zeros dropped. */
const MIN_PADDABLE_LENGTH = 8;

/**
 * An Iranian national identifier (کد ملی).
 *
 * Ten digits with a check digit. Wrapping it in a type rather than passing a
 * `string` means an invalid code cannot reach the database: the only way to
 * obtain one of these is through a factory that has already verified it.
 */
export class NationalId {
  private constructor(readonly value: string) {}

  /**
   * Parse and validate. Leading zeros are restored first — spreadsheets
   * routinely store these as numbers and eat the leading zero, which is why
   * nine-digit codes are common in the practice's source data.
   *
   * @throws InvalidInputError when the length or check digit is wrong.
   */
  static create(input: string): NationalId {
    const digits = NationalId.pad(input);

    if (digits === null || digits.length !== 10) {
      throw new InvalidInputError(
        ErrorCode.NationalIdLength,
        { length: digits?.length ?? 0 },
        `National id must be 10 digits, got ${digits?.length ?? 0}`,
      );
    }
    if (!NationalId.hasValidChecksum(digits)) {
      throw new InvalidInputError(
        ErrorCode.NationalIdChecksum,
        {},
        `National id ${digits} fails its check digit`,
      );
    }
    return new NationalId(digits);
  }

  /** Non-throwing variant, for importing data that may be wrong. */
  static tryCreate(input: string | null | undefined): NationalId | null {
    if (!input) return null;
    try {
      return NationalId.create(input);
    } catch {
      return null;
    }
  }

  static isValid(input: string | null | undefined): boolean {
    return NationalId.tryCreate(input) !== null;
  }

  /**
   * Left-pad to ten digits, or `null` when there are no digits at all.
   *
   * Padding is bounded to values that plausibly *lost* leading zeros — a
   * spreadsheet storing the code as a number drops one or two. Padding a
   * five-digit value up to ten would manufacture an id and then report the
   * failure as a bad check digit, hiding the real problem: it is not a
   * national id at all.
   */
  static pad(input: string | null | undefined): string | null {
    if (!input) return null;
    const digits = toLatinDigits(input).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length >= 10) return digits;
    return digits.length >= MIN_PADDABLE_LENGTH
      ? digits.padStart(10, '0')
      : digits;
  }

  /**
   * The published check-digit algorithm. Codes made of one repeated digit
   * satisfy the arithmetic but are never issued, so they are rejected too.
   */
  private static hasValidChecksum(id: string): boolean {
    if (/^(\d)\1{9}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(id[i]) * (10 - i);
    const remainder = sum % 11;
    const check = Number(id[9]);
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }

  equals(other: NationalId | null): boolean {
    return other !== null && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
