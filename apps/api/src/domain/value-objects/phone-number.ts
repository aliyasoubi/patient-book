import { InvalidInputError } from '../errors/domain.error';
import { ErrorCode } from '../errors/error-code';
import { toLatinDigits } from '../services/persian-text';

/**
 * An Iranian mobile number, normalised to local `09xxxxxxxxx` form.
 *
 * The practice's records hold the same number written four ways — `+98912…`,
 * `0098912…`, `98912…`, `912…`. Normalising on construction means a search or a
 * duplicate check compares one canonical form.
 */
export class MobileNumber {
  private constructor(readonly value: string) {}

  static create(input: string): MobileNumber {
    const normalised = MobileNumber.normalise(input);
    if (!normalised || !/^09\d{9}$/.test(normalised)) {
      throw new InvalidInputError(
        ErrorCode.MobileInvalid,
        { value: String(input) },
        `Not a valid Iranian mobile number: ${input}`,
      );
    }
    return new MobileNumber(normalised);
  }

  static tryCreate(input: string | null | undefined): MobileNumber | null {
    if (!input) return null;
    try {
      return MobileNumber.create(input);
    } catch {
      return null;
    }
  }

  static isValid(input: string | null | undefined): boolean {
    return MobileNumber.tryCreate(input) !== null;
  }

  /**
   * Strip every international prefix down to the local form. Returns whatever
   * digits remain even when they do not form a valid number, so an import can
   * preserve a malformed value while still flagging it.
   */
  static normalise(input: string | null | undefined): string | null {
    if (!input) return null;
    let d = toLatinDigits(input).replace(/[^\d+]/g, '');
    if (d.startsWith('+98')) d = '0' + d.slice(3);
    else if (d.startsWith('0098')) d = '0' + d.slice(4);
    else if (d.startsWith('98') && d.length === 12) d = '0' + d.slice(2);
    else if (d.startsWith('9') && d.length === 10) d = '0' + d;
    d = d.replace(/\D/g, '');
    return d || null;
  }

  toString(): string {
    return this.value;
  }
}

/** A landline. Area codes vary in length, so only the digit count is checked. */
export class LandlineNumber {
  private constructor(readonly value: string) {}

  static create(input: string): LandlineNumber {
    const digits = LandlineNumber.normalise(input);
    if (!digits || !/^\d{4,15}$/.test(digits)) {
      throw new InvalidInputError(
        ErrorCode.PhoneInvalid,
        { value: String(input) },
        `Not a valid landline number: ${input}`,
      );
    }
    return new LandlineNumber(digits);
  }

  static tryCreate(input: string | null | undefined): LandlineNumber | null {
    if (!input) return null;
    try {
      return LandlineNumber.create(input);
    } catch {
      return null;
    }
  }

  static normalise(input: string | null | undefined): string | null {
    if (!input) return null;
    const d = toLatinDigits(input).replace(/\D/g, '');
    return d || null;
  }

  toString(): string {
    return this.value;
  }
}
