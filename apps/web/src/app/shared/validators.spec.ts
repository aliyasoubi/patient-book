import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import {
  digitString,
  identifierValue,
  iranianMobile,
  iranianNationalId,
  toLatinDigits,
} from './validators';

describe('toLatinDigits', () => {
  it('folds Persian and Arabic-Indic digits and leaves everything else alone', () => {
    expect(toLatinDigits('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(toLatinDigits('٠٢١٢٢')).toBe('02122');
    expect(toLatinDigits('پرونده ۱۲')).toBe('پرونده 12');
  });
});

describe('identifierValue', () => {
  it('sends a folded, trimmed value and null for blank', () => {
    expect(identifierValue(' ۱۲۳۴ ')).toBe('1234');
    expect(identifierValue('   ')).toBeNull();
  });
});

describe('digitString', () => {
  const fileNo = digitString(1, 24);

  it('accepts Persian digits as digits', () => {
    expect(fileNo(new FormControl('۱۰۴۰۴'))).toBeNull();
  });

  it('reports the same key as Validators.pattern so field wording is unchanged', () => {
    expect(fileNo(new FormControl('12-34'))).toEqual({ pattern: true });
  });

  it('leaves an empty optional field alone', () => {
    expect(fileNo(new FormControl(''))).toBeNull();
  });
});

describe('iranianMobile', () => {
  it('accepts the local form in either digit script', () => {
    expect(iranianMobile(new FormControl('09121234567'))).toBeNull();
    expect(iranianMobile(new FormControl('۰۹۱۲۱۲۳۴۵۶۷'))).toBeNull();
  });

  it('rejects what the API would reject, separators included', () => {
    // Validating a looser form than the API accepts only moves the rejection
    // from the field to a generic server error after the save is attempted.
    expect(iranianMobile(new FormControl('0912 123 4567'))).toEqual({ mobile: true });
    expect(iranianMobile(new FormControl('9121234567'))).toEqual({ mobile: true });
  });
});

describe('iranianNationalId', () => {
  it('accepts a valid code in either digit script', () => {
    expect(iranianNationalId(new FormControl('0078980501'))).toBeNull();
    expect(iranianNationalId(new FormControl('۰۰۷۸۹۸۰۵۰۱'))).toBeNull();
  });

  it('flags length before the check digit', () => {
    expect(iranianNationalId(new FormControl('007898050'))).toEqual({ nationalIdLength: true });
    expect(iranianNationalId(new FormControl('007-898-0501'))).toEqual({ nationalIdLength: true });
  });

  it('rejects a wrong check digit and the never-issued repeated codes', () => {
    expect(iranianNationalId(new FormControl('0078980502'))).toEqual({ nationalIdInvalid: true });
    expect(iranianNationalId(new FormControl('1111111111'))).toEqual({ nationalIdInvalid: true });
  });
});
