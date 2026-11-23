import { describe, expect, it } from 'vitest';

import type { InventoryItem, Tariff } from '../../core/models/common.model';
import { foldKey, PRODUCTS, tariffCategories, tariffSections } from './tariff-sections';

const service = (id: string, category: string, title: string, note: string | null = null) =>
  ({ id, category, title, note, price: 1, maxPrice: null, version: 1 }) as Tariff;

const item = (over: Partial<InventoryItem>): InventoryItem =>
  ({
    id: 'i',
    name: 'مسواک',
    brand: null,
    spec: null,
    unit: 'piece',
    quantity: 3,
    soldToPatients: true,
    salePrice: 850_000,
    isArchived: false,
    ...over,
  }) as InventoryItem;

const services = [
  service('a', 'عمومی', 'ترمیم'),
  service('b', 'ایمپلنت', 'ایمپلنت Dentium'),
  service('c', 'عمومی', 'جرم‌گیری'),
  service('d', 'زیبایی', 'بلیچینگ مطب', 'هر فک'),
];
const stock = [
  item({ id: 'p1', brand: 'Oral-B', spec: 'نرم' }),
  item({ id: 'p2', name: 'کامپوزیت', soldToPatients: false }),
  item({ id: 'p3', name: 'نخ دندان', isArchived: true }),
];

const keys = (sections: ReturnType<typeof tariffSections>) =>
  sections.map((s) => [s.key, s.rows.map((r) => r.id)]);

describe('tariffSections', () => {
  it('groups services under their headings in first-seen order, then the items sold', () => {
    expect(keys(tariffSections(services, stock, '', null))).toEqual([
      ['عمومی', ['a', 'c']],
      ['ایمپلنت', ['b']],
      ['زیبایی', ['d']],
      [PRODUCTS, ['p1']],
    ]);
  });

  it('describes an item by its brand and size, and only its price', () => {
    const [row] = tariffSections([], stock, '', PRODUCTS)[0].rows;
    expect(row).toMatchObject({ title: 'مسواک', detail: 'Oral-B · نرم', price: 850_000 });
    expect(row).not.toHaveProperty('stock');
  });

  it('finds a line however it is typed, in its title, note or heading', () => {
    expect(keys(tariffSections(services, stock, 'جرم گيري', null))).toEqual([['عمومی', ['c']]]);
    expect(keys(tariffSections(services, stock, 'فک', null))).toEqual([['زیبایی', ['d']]]);
    expect(keys(tariffSections(services, stock, 'ایمپلنت dentium', null))).toEqual([
      ['ایمپلنت', ['b']],
    ]);
    expect(keys(tariffSections(services, stock, 'oral', null))).toEqual([[PRODUCTS, ['p1']]]);
  });

  it('narrows to one heading, and keeps the items section to add the first one', () => {
    expect(keys(tariffSections(services, stock, '', 'ایمپلنت'))).toEqual([['ایمپلنت', ['b']]]);
    expect(keys(tariffSections(services, [], '', null)).at(-1)).toEqual([PRODUCTS, []]);
    expect(keys(tariffSections(services, [], 'ترمیم', null))).toEqual([['عمومی', ['a']]]);
  });
});

describe('a line’s price date', () => {
  const now = new Date('2026-11-30T12:00:00+03:30');

  it('carries the day its price was set, and none while it has no price', () => {
    const dated = {
      ...service('x', 'عمومی', 'ترمیم'),
      priceChangedAt: '2026-11-23T12:00:00+03:30',
    };
    const unpriced = { ...dated, id: 'y', title: 'فایبر پست', price: null };
    const [section] = tariffSections([dated, unpriced], [], '', 'عمومی', now);
    expect(section.rows[0].changed).toMatchObject({ day: 2, monthKey: 'month.azar', days: 7 });
    expect(section.rows[1].changed).toBeNull();
  });

  it('dates an item by its sale price, not by when it last moved', () => {
    const sold = item({ id: 'p', salePriceChangedAt: '2025-08-01T12:00:00+03:30' });
    const [row] = tariffSections([], [sold], '', PRODUCTS, now)[0].rows;
    expect(row.changed?.age).toBe('stale');
    const undated = tariffSections([], [item({ id: 'q' })], '', PRODUCTS, now)[0].rows[0];
    expect(undated.changed).toBeNull();
  });
});

describe('tariffCategories', () => {
  it('lists each heading once, in list order', () => {
    expect(tariffCategories(services)).toEqual(['عمومی', 'ایمپلنت', 'زیبایی']);
  });
});

describe('foldKey', () => {
  it('folds Arabic letters, half-spaces and digits', () => {
    expect(foldKey('جرم‌گيري ۲')).toBe(foldKey('جرم گیری 2'));
  });
});
