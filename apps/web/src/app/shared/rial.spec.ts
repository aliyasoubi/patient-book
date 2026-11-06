import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { regroup, rialInput, rialValid, rialValue } from './rial';

describe('rialValue', () => {
  it('reads rials in either digit script, with or without commas', () => {
    expect(rialValue('12500000')).toBe(12_500_000);
    expect(rialValue('12,500,000')).toBe(12_500_000);
    expect(rialValue('۱۲۵۰۰۰۰۰')).toBe(12_500_000);
    expect(rialValue('۱۲٬۵۰۰٬۰۰۰')).toBe(12_500_000);
  });

  it('takes 0 as a price', () => {
    expect(rialValue('0')).toBe(0);
  });

  it('is null for an empty field or what is no number', () => {
    expect(rialValue('')).toBeNull();
    expect(rialValue('12a')).toBeNull();
  });
});

describe('rialInput', () => {
  it('starts a field grouped in threes, blank when there is no price', () => {
    expect(rialInput(12_500_000)).toBe('12,500,000');
    expect(rialInput(500)).toBe('500');
    expect(rialInput(0)).toBe('0');
    expect(rialInput(null)).toBe('');
  });
});

describe('rialValid', () => {
  const check = (value: string) => rialValid(new FormControl(value, { nonNullable: true }));

  it('leaves an empty field to the form to require', () => {
    expect(check('')).toBeNull();
  });

  it('refuses what is no number, and a typo of extra zeros', () => {
    expect(check('12,500,000')).toBeNull();
    expect(check('12a')).toEqual({ pattern: true });
    expect(check('12,500,000,000')).toEqual({ pattern: true });
  });
});

describe('regroup', () => {
  it('groups in threes as digits are typed at the end', () => {
    expect(regroup('1250', 4)).toEqual({ value: '1,250', caret: 5 });
    expect(regroup('1,2500', 6)).toEqual({ value: '12,500', caret: 6 });
    expect(regroup('۱۲۵۰', 4)).toEqual({ value: '1,250', caret: 5 });
  });

  it('keeps the caret before the same digits when one is typed in the middle', () => {
    // 1,2|50 and a 9: the caret stays before the 50.
    expect(regroup('1,2950', 4)).toEqual({ value: '12,950', caret: 4 });
  });

  it('keeps the caret in place when a digit is deleted in the middle', () => {
    // 12,9|50 and Backspace.
    expect(regroup('12,50', 3)).toEqual({ value: '1,250', caret: 3 });
  });

  it('does not leave the caret just after a comma, where Backspace would stick', () => {
    // 1,|250 and Backspace takes the comma: the caret moves before where it was.
    expect(regroup('1250', 1)).toEqual({ value: '1,250', caret: 1 });
  });

  it('leaves what is not a number as typed', () => {
    expect(regroup('12a', 3)).toEqual({ value: '12a', caret: 3 });
    expect(regroup('', 0)).toEqual({ value: '', caret: 0 });
  });
});
