import { ErrorCode } from '../errors/error-code';
import { InvalidInputError } from '../errors/domain.error';
import { LandlineNumber, MobileNumber } from './phone-number';
import { NationalId } from './national-id';

describe('NationalId', () => {
  it('accepts codes with a correct check digit', () => {
    expect(NationalId.create('0078980501').value).toBe('0078980501');
    expect(NationalId.isValid('0064689311')).toBe(true);
  });

  it('rejects a wrong check digit with a specific code', () => {
    try {
      NationalId.create('1234567890');
      fail('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInputError);
      expect((error as InvalidInputError).code).toBe(ErrorCode.NationalIdChecksum);
    }
  });

  it('reports a length problem separately from a checksum problem', () => {
    try {
      NationalId.create('12345');
      fail('expected a throw');
    } catch (error) {
      expect((error as InvalidInputError).code).toBe(ErrorCode.NationalIdLength);
      expect((error as InvalidInputError).params).toMatchObject({ length: 5 });
    }
  });

  it('rejects repdigit codes, which validate arithmetically but are never issued', () => {
    expect(NationalId.isValid('1111111111')).toBe(false);
  });

  it('restores leading zeros a spreadsheet dropped', () => {
    expect(NationalId.pad('78980501')).toBe('0078980501');
    expect(NationalId.pad('0078980501')).toBe('0078980501');
    expect(NationalId.pad('—')).toBeNull();
  });

  it('validates codes typed in Persian digits', () => {
    expect(NationalId.isValid('۰۰۷۸۹۸۰۵۰۱')).toBe(true);
  });

  it('tryCreate returns null instead of throwing, for importing messy data', () => {
    expect(NationalId.tryCreate('nonsense')).toBeNull();
    expect(NationalId.tryCreate(null)).toBeNull();
  });
});

describe('MobileNumber', () => {
  it.each([
    ['09122213008', '09122213008'],
    ['+989122213008', '09122213008'],
    ['00989122213008', '09122213008'],
    ['989122213008', '09122213008'],
    ['9122213008', '09122213008'],
    ['0912-221-3008', '09122213008'],
    ['۰۹۱۲۲۲۱۳۰۰۸', '09122213008'],
  ])('normalises %s to %s', (input, expected) => {
    expect(MobileNumber.create(input).value).toBe(expected);
  });

  it('rejects a number that is not the right length', () => {
    try {
      MobileNumber.create('0912221300');
      fail('expected a throw');
    } catch (error) {
      expect((error as InvalidInputError).code).toBe(ErrorCode.MobileInvalid);
    }
  });

  it('normalise keeps malformed digits so an import can flag them', () => {
    // The value is preserved even though it is not a valid number.
    expect(MobileNumber.normalise('0912221')).toBe('0912221');
    expect(MobileNumber.isValid('0912221')).toBe(false);
  });
});

describe('LandlineNumber', () => {
  it('keeps digits and drops separators', () => {
    expect(LandlineNumber.create('022-3384500').value).toBe('0223384500');
  });

  it('rejects a value with too few digits', () => {
    expect(LandlineNumber.tryCreate('12')).toBeNull();
  });
});
