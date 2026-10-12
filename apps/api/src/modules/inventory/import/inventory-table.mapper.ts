import { format } from 'date-fns';

import {
  InventoryCategory,
  InventoryUnit,
  normalizeForDisplay,
  searchKey,
  toLatinDigits,
} from '../../../domain';
import { canonicalBrand, normalizeSpec } from '../inventory-catalog';
import { identityKey, parseExpiry } from '../inventory-stock';
import {
  ImportedItem,
  ImportNote,
  RawCell,
  RawSheet,
  RawWorkbook,
  WorkbookImport,
} from './inventory-workbook.mapper';

/**
 * The normalized stock list: one «Inventory» sheet, a header row, and one row
 * per product and size — what the practice reviews and corrects in Excel
 * before it becomes the stock. Columns are found by their header, so a
 * column moved or added in Excel does not shift what is read.
 */
export const TABLE_SHEET = 'Inventory';

const HEADERS = {
  code: 'Code',
  category: 'Category',
  item: 'Item',
  name: 'نام کالا',
  brand: 'Brand',
  spec: 'Size / shade / variant',
  unit: 'Unit',
  quantity: 'On hand',
  minQuantity: 'Reorder level',
  lot: 'Lot / batch',
  expiryText: 'Expiry (as printed)',
  expiryDate: 'Expiry date',
} as const;
type Field = keyof typeof HEADERS;
const REQUIRED: readonly Field[] = ['category', 'name', 'quantity'];

/** Each category by its English label, its Persian label in the app, its code and its key. */
const CATEGORIES: ReadonlyArray<[InventoryCategory, ...string[]]> = [
  [InventoryCategory.Implant, 'Implants', 'ایمپلنت', 'IMP'],
  [
    InventoryCategory.Prosthetic,
    'Implant prosthetic parts',
    'قطعات پروتزی ایمپلنت',
    'PRO',
  ],
  [
    InventoryCategory.Regenerative,
    'Bone grafts & membranes',
    'پیوند استخوان و ممبران',
    'BGM',
  ],
  [InventoryCategory.Anesthesia, 'Local anesthesia', 'بی‌حسی', 'ANE'],
  [
    InventoryCategory.Restorative,
    'Restorative & cosmetic',
    'ترمیمی و زیبایی',
    'RES',
  ],
  [InventoryCategory.Endo, 'Endodontics', 'اندو', 'END'],
  [
    InventoryCategory.Impression,
    'Impression & crown delivery',
    'قالب‌گیری و تحویل روکش',
    'IMC',
  ],
  [InventoryCategory.Surgery, 'Oral surgery', 'جراحی', 'SUR'],
  [InventoryCategory.Orthodontic, 'Orthodontics', 'ارتودنسی', 'ORT'],
  [
    InventoryCategory.Consumable,
    'Consumables & infection control',
    'مصرفی و ضدعفونی',
    'CIC',
  ],
  [
    InventoryCategory.Hygiene,
    'Preventive & oral hygiene',
    'بهداشت دهان',
    'HYG',
  ],
  [InventoryCategory.Other, 'Equipment & other', 'تجهیزات و سایر', 'EQP'],
];
const CATEGORY_BY_KEY = new Map<string, InventoryCategory>();
for (const [category, ...labels] of CATEGORIES) {
  for (const label of [category, ...labels]) {
    CATEGORY_BY_KEY.set(searchKey(label), category);
  }
}

const UNIT_BY_KEY = new Map<string, InventoryUnit>(
  Object.values(InventoryUnit).map((u) => [searchKey(u), u]),
);

/** Whether this workbook is the normalized list rather than the practice's own sheets. */
export function isInventoryTable(workbook: RawWorkbook): boolean {
  const sheet = workbook.get(TABLE_SHEET);
  return Boolean(sheet && headerColumns(sheet).has('name'));
}

export function mapInventoryTable(workbook: RawWorkbook): WorkbookImport {
  const sheet = workbook.get(TABLE_SHEET)!;
  const columns = headerColumns(sheet);
  const items: ImportedItem[] = [];
  const notes: ImportNote[] = [];

  const missing = REQUIRED.filter((f) => !columns.has(f));
  if (missing.length) {
    notes.push({
      source: `${TABLE_SHEET}!1`,
      level: 'error',
      message: `missing column ${missing.map((f) => `"${HEADERS[f]}"`).join(', ')}`,
    });
    return { items, notes };
  }

  const seen = new Map<string, string>();
  for (let row = 2; row <= sheet.rowCount; row++) {
    const read = (f: Field): RawCell['value'] => {
      const col = columns.get(f);
      return col ? sheet.cell(row, col).value : null;
    };
    const at = (f: Field) =>
      `${TABLE_SHEET}!${columnLetter(columns.get(f) ?? 1)}${row}`;
    const source = `${TABLE_SHEET}!${row}`;
    const name = text(read('name')) ?? text(read('item'));
    if (!name) continue;
    const fail = (f: Field, message: string) =>
      notes.push({ source: at(f), level: 'error', message });

    const category = CATEGORY_BY_KEY.get(searchKey(text(read('category'))));
    if (!category) {
      fail('category', `unknown category "${text(read('category')) ?? ''}"`);
      continue;
    }
    const unitText = text(read('unit'));
    const unit = unitText
      ? UNIT_BY_KEY.get(searchKey(unitText))
      : InventoryUnit.Piece;
    if (!unit) {
      fail('unit', `unknown unit "${unitText}"`);
      continue;
    }
    const quantity = whole(read('quantity'));
    if (quantity === undefined) {
      fail('quantity', `"${text(read('quantity'))}" is not a whole number`);
      continue;
    }
    const minQuantity = whole(read('minQuantity'));
    if (minQuantity === undefined) {
      fail(
        'minQuantity',
        `"${text(read('minQuantity'))}" is not a whole number`,
      );
      continue;
    }
    const printed = text(read('expiryText'));
    const dated = read('expiryDate');
    const expiryInput =
      printed ??
      (dated instanceof Date ? format(dated, 'yyyy/MM/dd') : text(dated));
    const expiry = parseExpiry(expiryInput);
    if (expiryInput && !expiry) {
      fail(
        printed ? 'expiryText' : 'expiryDate',
        `expiry "${expiryInput}" is not a date`,
      );
      continue;
    }

    const brand = canonicalBrand(text(read('brand')));
    const spec = normalizeSpec(category, text(read('spec')));
    const key = identityKey({ category, name, brand, spec });
    const twin = seen.get(key);
    if (twin) {
      notes.push({
        source,
        level: 'error',
        message: `same product and size as ${twin} — one row each, counts added together`,
      });
      continue;
    }
    seen.set(key, source);

    if (quantity === null) {
      notes.push({
        source: at('quantity'),
        level: 'review',
        message: 'no count — imported as 0, count the shelf',
      });
    }
    const code = text(read('code'));
    const english = text(read('item'));
    items.push({
      source,
      category,
      name,
      brand,
      spec,
      unit,
      quantity: quantity ?? 0,
      minQuantity,
      lotNumber: text(read('lot')),
      expiry,
      // The list's code and English name, kept on the item so a search in
      // either finds it.
      notes:
        [code, english !== name ? english : null].filter(Boolean).join(' · ') ||
        null,
    });
  }
  return { items, notes };
}

/** Each known header's column, by its text in row 1. */
function headerColumns(sheet: RawSheet): Map<Field, number> {
  const byText = new Map<string, Field>(
    (Object.entries(HEADERS) as Array<[Field, string]>).map(([f, h]) => [
      searchKey(h),
      f,
    ]),
  );
  const columns = new Map<Field, number>();
  for (let col = 1; col <= 60; col++) {
    const field = byText.get(searchKey(text(sheet.cell(1, col).value)));
    if (field && !columns.has(field)) columns.set(field, col);
  }
  return columns;
}

function text(value: RawCell['value']): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return format(value, 'yyyy/MM/dd');
  return normalizeForDisplay(String(value)) || null;
}

/** A count: blank is `null`, a whole number ≥ 0 is itself, anything else `undefined`. */
function whole(value: RawCell['value']): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'number'
      ? value
      : Number(toLatinDigits(String(value)).trim());
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function columnLetter(col: number): string {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}
