import { describe, expect, it } from '@jest/globals';

import { InventoryCategory, InventoryUnit } from '../../../domain';
import {
  isInventoryTable,
  mapInventoryTable,
  TABLE_SHEET,
} from './inventory-table.mapper';
import { RawSheet, RawWorkbook } from './inventory-workbook.mapper';

type Value = string | number | Date | null;

const HEADER = [
  'Code',
  'Category',
  'دسته',
  'Item',
  'نام کالا',
  'Brand',
  'Size / shade / variant',
  'Unit',
  'On hand',
  'Reorder level',
  'Lot / batch',
  'Expiry (as printed)',
  'Expiry date',
];

function table(rows: Value[][]): RawWorkbook {
  const all = [HEADER, ...rows];
  const sheet: RawSheet = {
    rowCount: all.length,
    cell: (row, col) => ({ value: all[row - 1]?.[col - 1] ?? null }),
  };
  return new Map([[TABLE_SHEET, sheet]]);
}

describe('mapInventoryTable', () => {
  it('reads a row of the normalized list into an item', () => {
    const wb = table([
      [
        'IMP-012',
        'Implants',
        'ایمپلنت',
        'SuperLine implant',
        'ایمپلنت SuperLine',
        'dentium',
        '4.0 - 10',
        'Piece',
        7,
        3,
        'lot a1',
        '2029/06',
        new Date(2029, 5, 30),
      ],
      [
        'END-001',
        'اندو',
        'اندو',
        'K-file',
        'کا فایل',
        null,
        '#25',
        'Box',
        null,
        null,
        null,
        null,
        null,
      ],
    ]);
    expect(isInventoryTable(wb)).toBe(true);
    const { items, notes } = mapInventoryTable(wb);
    expect(items[0]).toMatchObject({
      category: InventoryCategory.Implant,
      name: 'ایمپلنت SuperLine',
      brand: 'Dentium',
      spec: '4.0x10',
      unit: InventoryUnit.Piece,
      quantity: 7,
      minQuantity: 3,
      lotNumber: 'lot a1',
      expiry: { text: '2029/06' },
      notes: 'IMP-012 · SuperLine implant',
    });
    // A blank count is 0, to be counted; a Persian category label is read too.
    expect(items[1]).toMatchObject({
      category: InventoryCategory.Endo,
      unit: InventoryUnit.Box,
      quantity: 0,
      minQuantity: null,
    });
    expect(notes).toEqual([
      expect.objectContaining({ level: 'review', source: 'Inventory!I3' }),
    ]);
  });

  it('refuses a row it cannot read, and a product listed twice', () => {
    const { notes } = mapInventoryTable(
      table([
        [
          'X-1',
          'Snacks',
          null,
          null,
          'چیپس',
          null,
          null,
          null,
          1,
          null,
          null,
          null,
          null,
        ],
        [
          'A',
          'Endodontics',
          null,
          'K-file',
          'کا فایل',
          null,
          '#25',
          null,
          'two',
          null,
          null,
          null,
          null,
        ],
        [
          'B',
          'Endodontics',
          null,
          'K-file',
          'کا فایل',
          null,
          '#30',
          null,
          2,
          null,
          null,
          null,
          null,
        ],
        [
          'C',
          'Endodontics',
          null,
          'K-file',
          'کا فایل',
          null,
          '#30',
          null,
          1,
          null,
          null,
          null,
          null,
        ],
      ]),
    );
    expect(
      notes.filter((n) => n.level === 'error').map((n) => n.message),
    ).toEqual([
      'unknown category "Snacks"',
      '"two" is not a whole number',
      'same product and size as Inventory!4 — one row each, counts added together',
    ]);
  });

  it('is not the practice sheets', () => {
    expect(isInventoryTable(new Map())).toBe(false);
  });
});
