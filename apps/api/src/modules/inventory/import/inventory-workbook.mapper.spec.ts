import { describe, expect, it } from '@jest/globals';

import { InventoryCategory, InventoryUnit } from '../../../domain';
import {
  columnIndex,
  ImportNote,
  mapInventoryWorkbook,
  RawCell,
  RawSheet,
  SECTIONS,
} from './inventory-workbook.mapper';

type Value = RawCell['value'] | RawCell;

/** A sheet from rows of values, row 1 first; `{ value, merged }` where it matters. */
function sheet(rows: Value[][]): RawSheet {
  return {
    rowCount: rows.length,
    cell: (row, col) => {
      const v = rows[row - 1]?.[col - 1] ?? null;
      return v !== null && typeof v === 'object' && !(v instanceof Date)
        ? v
        : { value: v };
    },
  };
}

/** The «انبار» sheet's real header rows, with `data` rows placed by column letter. */
function store(data: Array<Record<string, Value>>): RawSheet {
  const header: Value[] = [];
  for (const s of SECTIONS.filter((s) => s.sheet === 'انبار')) {
    for (const column of [s.name, s.brand, s.quantity, s.expiry, s.price]) {
      if (column) header[columnIndex(column[0]) - 1] = column[1];
    }
    for (const { column } of s.spec ?? []) {
      header[columnIndex(column[0]) - 1] = column[1];
    }
  }
  const rows = data.map((cells) => {
    const row: Value[] = [];
    for (const [letter, v] of Object.entries(cells)) {
      row[columnIndex(letter) - 1] = v;
    }
    return row;
  });
  return sheet([[], header, ...rows]);
}

const IMPLANT_HEADER = [
  'برند ایمپلنت',
  'نوع ایمپلنت',
  'سایز ایمپلنت',
  'تعداد موجودی',
];

/** Notes about one sheet; every other sheet is simply absent here. */
const about = (notes: ImportNote[], sheetName: string) =>
  notes.filter(
    (n) => n.source.startsWith(`${sheetName}!`) && n.level !== 'renamed',
  );

describe('mapInventoryWorkbook', () => {
  it('reads an implant sheet, skipping the brand copied down empty rows', () => {
    const { items, notes } = mapInventoryWorkbook(
      new Map([
        [
          'Dentium',
          sheet([
            IMPLANT_HEADER,
            ['Dentium', 'Supe Line', '3.6x8', 4],
            ['Dentium', 'Supe Line', '4x10', 0],
            ['Dentium', null, null, null],
            [null, null, null, 4],
          ]),
        ],
      ]),
    );
    expect(items).toEqual([
      expect.objectContaining({
        source: 'Dentium!D2',
        category: InventoryCategory.Implant,
        name: 'SuperLine',
        brand: 'Dentium',
        spec: '3.6x8',
        quantity: 4,
      }),
      expect.objectContaining({ spec: '4x10', quantity: 0 }),
    ]);
    // The line's name is put right, and the preview says so.
    expect(notes).toContainEqual(
      expect.objectContaining({
        source: 'Dentium!D2',
        level: 'renamed',
        message: 'Supe Line ‹Dentium› (3.6x8)  →  SuperLine ‹Dentium› (3.6x8)',
      }),
    );
    expect(about(notes, 'Dentium')).toEqual([
      expect.objectContaining({ source: 'Dentium!B4', level: 'info' }),
      expect.objectContaining({
        source: 'Dentium!D5',
        level: 'info',
        message: 'sheet total 4 matches its rows',
      }),
    ]);
  });

  it('flags a hand-typed total that disagrees with the rows', () => {
    const { notes } = mapInventoryWorkbook(
      new Map([
        [
          'TRI',
          sheet([
            ['', 'نوع ایمپلنت', 'سایز ایمپلنت', 'تعداد موجودی'],
            ['TRI', null, '3.3x10', 2],
            [null, null, null, 'جمع کل '],
            [null, null, null, 3],
          ]),
        ],
      ]),
    );
    expect(about(notes, 'TRI')).toEqual([
      expect.objectContaining({
        level: 'review',
        message: 'sheet total says 3, but its rows add up to 2',
      }),
    ]);
  });

  it('names an implant with no line after the category', () => {
    const { items } = mapInventoryWorkbook(
      new Map([
        [
          'TRI',
          sheet([
            ['', 'نوع ایمپلنت', 'سایز ایمپلنت', 'تعداد موجودی'],
            ['TRI', null, '4.1 x 8', 5],
          ]),
        ],
      ]),
    );
    expect(items[0]).toMatchObject({
      name: 'ایمپلنت',
      brand: 'TRI',
      spec: '4.1x8',
    });
  });

  it('turns a diameter Excel made a date back into the decimal typed', () => {
    const { items, notes } = mapInventoryWorkbook(
      new Map([
        [
          'هیلینگ',
          sheet([
            ['برند ', 'مدل هیلینگ', 'D', 'G/H', 'تعداد موجودی'],
            [
              'Straumann',
              'Rc',
              { value: new Date(Date.UTC(2023, 5, 5)), numFmt: 'm/d' },
              4,
              1,
            ],
          ]),
        ],
      ]),
    );
    expect(items[0]).toMatchObject({
      name: 'هیلینگ',
      spec: 'RC · D 6.5 · G/H 4',
    });
    expect(about(notes, 'هیلینگ')).toEqual([
      expect.objectContaining({ source: 'هیلینگ!C2', level: 'review' }),
    ]);
  });

  it('merges a product listed twice, adding the counts', () => {
    const { items, notes } = mapInventoryWorkbook(
      new Map([
        [
          'هیلینگ',
          sheet([
            ['برند ', 'مدل هیلینگ', 'D', 'G/H', 'تعداد موجودی'],
            ['Straumann', 'Rc', 5, 2, 5],
            ['Straumann', 'Rc', 5, 2, 2],
          ]),
        ],
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(7);
    expect(about(notes, 'هیلینگ')).toEqual([
      expect.objectContaining({ source: 'هیلینگ!E3', level: 'review' }),
    ]);
  });

  it('tells an abutment’s brand from a part named in the same column', () => {
    const { items } = mapInventoryWorkbook(
      new Map([
        [
          'Abatement',
          sheet([
            ['برند ایمپلنت', 'D', 'G/H', 'تعداد موجودی'],
            ['Dentium', 4.5, 1.5, 11],
            ['Analog', null, null, 10],
          ]),
        ],
      ]),
    );
    expect(items).toEqual([
      expect.objectContaining({
        name: 'اباتمنت',
        brand: 'Dentium',
        spec: 'D 4.5 · G/H 1.5',
      }),
      expect.objectContaining({
        name: 'آنالوگ',
        brand: null,
        spec: null,
        quantity: 10,
      }),
    ]);
  });

  it('reads the store’s side-by-side sections, a merged name only where its row has data', () => {
    const merged = (value: string): RawCell => ({ value, merged: true });
    const { items } = mapInventoryWorkbook(
      new Map([
        [
          'انبار',
          store([
            { P: 'واش', Q: 9, E: 'لیدوکایین', F: 5 },
            { P: merged('اکتیواتور'), H: '3M', I: 'A2 Z250', J: 2 },
            { P: merged('اکتیواتور'), Q: 9, R: 0 },
          ]),
        ],
      ]),
    );
    expect(
      items.map((i) => [i.category, i.name, i.brand, i.spec, i.quantity]),
    ).toEqual([
      [InventoryCategory.Anesthesia, 'لیدوکائین', null, null, 5],
      [InventoryCategory.Restorative, 'کامپوزیت Filtek Z250', '3M', 'A2', 2],
      [InventoryCategory.Impression, 'واش', null, null, 9],
      [InventoryCategory.Impression, 'اکتیواتور', null, null, 9],
    ]);
  });

  it('reads quantities written with their unit, and keeps what it cannot', () => {
    const { items, notes } = mapInventoryWorkbook(
      new Map([
        [
          'انبار',
          store([
            { Z: 'سرنگ بوتاکس', AB: '۳ بسته' },
            { Z: 'دستکش جراحی', AB: 'دو جعبه' },
            { Z: 'روکش کفش', AB: 'چند تا' },
            { Z: 'کن کاغذی', AB: null },
          ]),
        ],
      ]),
    );
    expect(items.map((i) => [i.quantity, i.unit, i.notes])).toEqual([
      [3, InventoryUnit.Pack, null],
      [2, InventoryUnit.Box, null],
      [0, InventoryUnit.Piece, 'تعداد: چند تا'],
      [0, InventoryUnit.Piece, null],
    ]);
    expect(about(notes, 'انبار').map((n) => n.level)).toEqual([
      'info',
      'info',
      'review',
      'review',
    ]);
  });

  it('reads each way the sheet writes an expiry', () => {
    const utc = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m - 1, d));
    const { items, notes } = mapInventoryWorkbook(
      new Map([
        [
          'انبار',
          store([
            {
              V: 'month',
              X: 1,
              Y: { value: utc(2029, 7, 1), numFmt: 'yyyy/m' },
            },
            {
              V: 'day',
              X: 1,
              Y: { value: utc(2028, 5, 16), numFmt: 'yyyy/m/d' },
            },
            { V: 'jalali', X: 1, Y: '1407/5' },
            { V: 'year', X: 1, Y: 2028 },
            { V: 'none', X: 1, Y: ' ' },
            { V: 'junk', X: 1, Y: 'آخر سال' },
          ]),
        ],
      ]),
    );
    expect(items.map((i) => [i.name, i.expiry?.text ?? null])).toEqual([
      ['month', '2029/07'],
      ['day', '2028/05/16'],
      ['jalali', '1407/05'],
      ['year', '2028'],
      ['none', null],
      ['junk', null],
    ]);
    expect(items[5].notes).toBe('تاریخ: آخر سال');
    expect(about(notes, 'انبار').map((n) => n.source)).toEqual([
      'انبار!Y6',
      'انبار!Y8',
    ]);
  });

  it('keeps a price, whose units the sheet mixes, as written in the notes', () => {
    const { items } = mapInventoryWorkbook(
      new Map([
        ['انبار', store([{ AD: 'مسواک ارتودنسی', AE: 10, AF: '1/500' }])],
      ]),
    );
    expect(items[0]).toMatchObject({
      category: InventoryCategory.Hygiene,
      quantity: 10,
      notes: 'قیمت تومان: 1/500',
    });
  });

  it('refuses a sheet whose columns have moved', () => {
    const { items, notes } = mapInventoryWorkbook(
      new Map([
        [
          'Dentium',
          sheet([
            ['برند ایمپلنت', 'سایز ایمپلنت', 'نوع ایمپلنت', 'تعداد موجودی'],
            ['Dentium', '3.6x8', 'Supe Line', 4],
          ]),
        ],
      ]),
    );
    expect(items).toEqual([]);
    expect(about(notes, 'Dentium').every((n) => n.level === 'error')).toBe(
      true,
    );
  });
});
