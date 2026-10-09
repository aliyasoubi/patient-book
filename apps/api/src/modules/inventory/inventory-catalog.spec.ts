import { describe, expect, it } from '@jest/globals';

import { InventoryCategory } from '../../domain';
import {
  brandSpellings,
  canonicalBrand,
  normalizeSpec,
} from './inventory-catalog';

describe('canonicalBrand', () => {
  it.each([
    ['dentium', 'Dentium'],
    ['دنتیوم', 'Dentium'],
    ['اشترومن', 'Straumann'],
    ['tokoyama', 'Tokuyama'],
    ['oral b', 'Oral-B'],
    ['3m', '3M'],
    ['  جي سي ', 'GC'],
  ])('spells %p as the catalogue does', (typed, brand) => {
    expect(canonicalBrand(typed)).toBe(brand);
  });

  it('keeps a brand it does not know as typed, tidied', () => {
    expect(canonicalBrand('  Acme   Dental ')).toBe('Acme Dental');
    expect(canonicalBrand('  ')).toBeNull();
  });
});

describe('brandSpellings', () => {
  it('lists every way a known brand is written', () => {
    expect(brandSpellings('straumann')).toEqual(
      expect.arrayContaining(['Straumann', 'اشترومن', 'استرومن']),
    );
    expect(brandSpellings('Acme')).toEqual([]);
  });
});

describe('normalizeSpec', () => {
  const implant = InventoryCategory.Implant;
  const graft = InventoryCategory.Regenerative;

  it('writes an implant size one way, platform in capitals', () => {
    for (const typed of ['4.1-10', '4.1 x 10', '4/1*10', '4.1×10', '۴.۱x۱۰']) {
      expect(normalizeSpec(implant, typed)).toBe('4.1x10');
    }
    expect(normalizeSpec(implant, 'rc 4.1-10')).toBe('RC 4.1x10');
  });

  it('writes a membrane by its sides and a graft by its range', () => {
    expect(normalizeSpec(graft, '1 در 1/5')).toBe('1x1.5');
    expect(normalizeSpec(graft, '500تا 1000')).toBe('500-1000');
  });

  it('leaves a slash alone where it is not a decimal: a suture is 4/0', () => {
    expect(normalizeSpec(InventoryCategory.Surgery, ' 4/0 ')).toBe('4/0');
  });
});
