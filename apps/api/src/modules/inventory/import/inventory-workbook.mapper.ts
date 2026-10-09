import {
  extractImplantBrand,
  InventoryCategory,
  InventoryUnit,
  normalizeForDisplay,
  toLatinDigits,
} from '../../../domain';
import { Expiry, identityKey, parseExpiry } from '../inventory-stock';
import { Named, standardize } from './standardize';

/** «name ‹brand› (spec)», for the preview's list of renames. */
const describe = (n: Named): string =>
  [n.name, n.brand && `‹${n.brand}›`, n.spec && `(${n.spec})`]
    .filter(Boolean)
    .join(' ');

/**
 * The practice's stock workbook («موجودی انبار.xlsx») read into items.
 *
 * The workbook is one sheet per implant system, one each for healing caps and
 * abutments, a «Membrane» sheet with grafts beside membranes, and an «انبار»
 * sheet holding nine categories side by side, each a few columns under a
 * merged title. Its layout is written out below, column by column, rather
 * than guessed from the headers: every expected header is checked, and a
 * workbook that has moved a column is refused instead of imported askew.
 *
 * Nothing is invented and nothing is dropped. A value that cannot be read —
 * a quantity like «دو جعبه» aside, which can — goes into the item's notes as
 * written and is listed for review; so is everything the import had to
 * interpret, like the diameters Excel turned into dates.
 */

/** A cell as the workbook holds it, before any reading. */
export interface RawCell {
  value: string | number | Date | null;
  /** Excel's display format — what tells a month-only expiry from a full date. */
  numFmt?: string;
  /** Inside a merged range, whose one value Excel repeats down every row of it. */
  merged?: boolean;
}

export interface RawSheet {
  rowCount: number;
  /** 1-based row and column. */
  cell(row: number, col: number): RawCell;
}

/** Sheets by name, trimmed — the workbook has «هیلینگ » with a trailing space. */
export type RawWorkbook = ReadonlyMap<string, RawSheet>;

export interface ImportedItem {
  /** Where it came from, `انبار!S12`, for the report and the stock card. */
  source: string;
  category: InventoryCategory;
  name: string;
  brand: string | null;
  spec: string | null;
  unit: InventoryUnit;
  quantity: number;
  expiry: Expiry | null;
  notes: string | null;
}

export interface ImportNote {
  source: string;
  /**
   * `error` stops the import; `review` is worth a look on the shelf;
   * `renamed` is a name, brand or size put into the standard form; `info` is
   * for the record.
   */
  level: 'error' | 'review' | 'renamed' | 'info';
  message: string;
}

export interface WorkbookImport {
  items: ImportedItem[];
  notes: ImportNote[];
}

/** One column, by letter, and the header it must carry (`null`: not checked). */
type Column = readonly [letter: string, header: string | null];

interface SpecColumn {
  column: Column;
  /** Shown before the value: «D 4.5», «پلتفرم 4.8». */
  label?: string;
  /** A measurement: a date here is a decimal Excel misread («6/5» → 6.5). */
  decimal?: boolean;
}

interface Section {
  sheet: string;
  category: InventoryCategory;
  /** The row of column headers; data starts on the next. */
  headerRow: number;
  /** For a section with no name column, or a row whose name cell is empty. */
  defaultName?: string;
  name?: Column;
  brand?: Column;
  /** A brand when it names an implant system («Dentium»), the item itself otherwise («Analog»). */
  nameOrBrand?: Column;
  spec?: readonly SpecColumn[];
  quantity: Column;
  expiry?: Column;
  /** Kept in the notes: the sheet's prices mix units too freely to be numbers. */
  price?: Column;
  /** The sheet ends in a hand-typed total, checked against its rows. */
  hasTotal?: boolean;
}

const implantSheet = (
  sheet: string,
  columns: Pick<Section, 'brand' | 'name' | 'spec' | 'quantity'>,
): Section => ({
  sheet,
  category: InventoryCategory.Implant,
  headerRow: 1,
  defaultName: 'ایمپلنت',
  hasTotal: true,
  ...columns,
});

/** «انبار»: nine categories side by side under merged titles on row 1. */
const storeSection = (
  category: InventoryCategory,
  columns: Omit<Section, 'sheet' | 'category' | 'headerRow'>,
): Section => ({ sheet: 'انبار', category, headerRow: 2, ...columns });

export const SECTIONS: readonly Section[] = [
  implantSheet('Dentium', {
    brand: ['A', 'برند ایمپلنت'],
    name: ['B', 'نوع ایمپلنت'],
    spec: [{ column: ['C', 'سایز ایمپلنت'] }],
    quantity: ['D', 'تعداد موجودی'],
  }),
  implantSheet('Straumann', {
    // The header cell over the brands is a run of stray keystrokes.
    brand: ['A', null],
    name: ['B', 'نوع ایمپلنت'],
    spec: [{ column: ['C', 'سایز ایمپلنت'] }],
    quantity: ['D', 'تعداد موجودی'],
  }),
  implantSheet('Zimmer', {
    brand: ['A', ''],
    name: ['B', 'نوع ایمپلنت'],
    spec: [
      { column: ['D', 'سایز ایمپلنت'] },
      { column: ['C', 'پلتفرم'], label: 'پلتفرم' },
    ],
    quantity: ['E', 'تعداد'],
  }),
  implantSheet('TRI', {
    brand: ['A', ''],
    name: ['B', 'نوع ایمپلنت'],
    spec: [{ column: ['C', 'سایز ایمپلنت'] }],
    quantity: ['D', 'تعداد موجودی'],
  }),
  {
    sheet: 'هیلینگ',
    category: InventoryCategory.Prosthetic,
    headerRow: 1,
    defaultName: 'هیلینگ',
    brand: ['A', 'برند'],
    spec: [
      { column: ['B', 'مدل هیلینگ'] },
      { column: ['C', 'D'], label: 'D', decimal: true },
      { column: ['D', 'G/H'], label: 'G/H', decimal: true },
    ],
    quantity: ['E', 'تعداد موجودی'],
  },
  {
    sheet: 'Abatement',
    category: InventoryCategory.Prosthetic,
    headerRow: 1,
    defaultName: 'اباتمنت',
    nameOrBrand: ['A', 'برند ایمپلنت'],
    spec: [
      { column: ['B', 'D'], label: 'D', decimal: true },
      { column: ['C', 'G/H'], label: 'G/H', decimal: true },
    ],
    quantity: ['D', 'تعداد موجودی'],
  },
  // Its title reads only «ی»; what is under it is restorative and general stock.
  storeSection(InventoryCategory.Restorative, {
    name: ['A', 'کالا'],
    spec: [{ column: ['B', 'مدل'] }],
    quantity: ['C', 'تعداد'],
    expiry: ['D', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Anesthesia, {
    name: ['E', 'کارپول'],
    quantity: ['F', 'تعداد'],
    expiry: ['G', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Restorative, {
    defaultName: 'کامپوزیت',
    brand: ['H', 'برند'],
    spec: [{ column: ['I', 'مدل'] }],
    quantity: ['J', 'تعداد'],
    expiry: ['K', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Restorative, {
    defaultName: 'لمینت',
    brand: ['L', 'برند'],
    spec: [{ column: ['M', 'مدل'] }],
    quantity: ['N', 'تعداد'],
    expiry: ['O', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Impression, {
    name: ['P', 'کالا'],
    quantity: ['Q', 'تعداد'],
    expiry: ['R', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Endo, {
    name: ['S', 'کالا'],
    quantity: ['T', 'تعداد'],
    expiry: ['U', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Surgery, {
    name: ['V', 'کالا'],
    spec: [{ column: ['W', 'مدل'] }],
    quantity: ['X', 'تعداد'],
    expiry: ['Y', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Consumable, {
    name: ['Z', 'کالا'],
    spec: [{ column: ['AA', 'مدل'] }],
    quantity: ['AB', 'تعداد'],
    expiry: ['AC', 'تاریخ'],
  }),
  storeSection(InventoryCategory.Hygiene, {
    name: ['AD', 'کالا'],
    quantity: ['AE', 'تعداد'],
    price: ['AF', 'قیمت تومان'],
  }),
  {
    // Untitled on the sheet: regen and the syringe grafts, by particle size.
    sheet: 'Membrane',
    category: InventoryCategory.Regenerative,
    headerRow: 2,
    defaultName: 'پودر استخوان',
    brand: ['A', 'برند'],
    spec: [{ column: ['B', 'سایز'] }],
    quantity: ['C', 'تعداد'],
    expiry: ['D', 'تاریخ'],
  },
  {
    sheet: 'Membrane',
    category: InventoryCategory.Regenerative,
    headerRow: 2,
    defaultName: 'ممبران',
    brand: ['E', 'برند'],
    spec: [{ column: ['F', 'سایز'] }],
    quantity: ['G', 'تعداد'],
    expiry: ['H', 'تاریخ'],
  },
];

/** `A` → 1, `AB` → 28. */
export function columnIndex(letter: string): number {
  return [...letter].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** Counted units staff wrote beside a number: «۳ بسته», «دو جعبه». */
const UNIT_WORDS: Readonly<Record<string, InventoryUnit>> = {
  عدد: InventoryUnit.Piece,
  بسته: InventoryUnit.Pack,
  جعبه: InventoryUnit.Box,
};

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  هفت: 7,
  هشت: 8,
  نه: 9,
  ده: 10,
};

const pad = (n: number): string => String(n).padStart(2, '0');

function isBlank(cell: RawCell): boolean {
  return (
    cell.value === null ||
    (typeof cell.value === 'string' && !normalizeForDisplay(cell.value))
  );
}

/** A cell as text; a number as written, without a trailing `.0`. */
function text(cell: RawCell): string {
  if (cell.value === null || cell.value instanceof Date) return '';
  return normalizeForDisplay(String(cell.value));
}

export function mapInventoryWorkbook(workbook: RawWorkbook): WorkbookImport {
  const items: ImportedItem[] = [];
  const notes: ImportNote[] = [];

  for (const section of SECTIONS) {
    const sheet = workbook.get(section.sheet);
    if (!sheet) {
      notes.push({
        source: section.sheet,
        level: 'error',
        message: 'sheet not found in the workbook',
      });
      continue;
    }
    if (!headersMatch(section, sheet, notes)) continue;

    const ref = (letter: string, row: number): string =>
      `${section.sheet}!${letter}${row}`;
    const cell = (column: Column | undefined, row: number): RawCell =>
      column ? sheet.cell(row, columnIndex(column[0])) : { value: null };
    let sum = 0;

    for (let row = section.headerRow + 1; row <= sheet.rowCount; row++) {
      const nameCell = cell(section.name, row);
      const qtyCell = cell(section.quantity, row);
      const expiryCell = cell(section.expiry, row);
      const priceCell = cell(section.price, row);
      const at = ref(section.quantity[0], row);

      let name = text(nameCell);
      let brand = text(cell(section.brand, row)) || null;
      if (section.nameOrBrand) {
        const value = text(cell(section.nameOrBrand, row));
        if (extractImplantBrand(value)) brand = value || null;
        else name = value;
      }
      const spec: string[] = [];
      for (const s of section.spec ?? []) {
        const value = specText(
          cell(s.column, row),
          s,
          ref(s.column[0], row),
          notes,
        );
        if (value) spec.push(s.label ? `${s.label} ${value}` : value);
      }
      const hasExpiry = !isBlank(expiryCell) && expiryCell.value !== 0;
      const hasData =
        spec.length > 0 ||
        !isBlank(qtyCell) ||
        hasExpiry ||
        !isBlank(priceCell);

      if (!name && !brand && !spec.length) {
        // A number alone under the quantities is the sheet's own total.
        if (section.hasTotal && typeof qtyCell.value === 'number') {
          notes.push(
            qtyCell.value === sum
              ? {
                  source: at,
                  level: 'info',
                  message: `sheet total ${qtyCell.value} matches its rows`,
                }
              : {
                  source: at,
                  level: 'review',
                  message: `sheet total says ${qtyCell.value}, but its rows add up to ${sum}`,
                },
          );
        }
        continue;
      }
      // A merged name repeats down rows that hold nothing else, and a brand
      // copied down the first column marks no item of its own.
      if (!hasData && (nameCell.merged || !name)) {
        if (!nameCell.merged) {
          const first = section.name ?? section.brand ?? section.nameOrBrand;
          notes.push({
            source: ref(first![0], row),
            level: 'info',
            message: `row holds only "${name || brand}" — nothing to import`,
          });
        }
        continue;
      }

      const itemNotes: string[] = [];
      const { quantity, unit } = readQuantity(qtyCell, at, notes, itemNotes);
      const expiry = hasExpiry
        ? readExpiry(expiryCell, ref(section.expiry![0], row), notes, itemNotes)
        : null;
      if (!isBlank(priceCell)) {
        itemNotes.push(`${section.price![1]}: ${text(priceCell)}`);
      }

      sum += quantity;
      const read = {
        category: section.category,
        name: name || section.defaultName || '',
        brand,
        spec: spec.join(' · ') || null,
      };
      const { item: standard, changed } = standardize(read);
      if (changed) {
        notes.push({
          source: at,
          level: 'renamed',
          message: `${describe(read)}  →  ${describe(standard)}`,
        });
      }
      items.push({
        source: at,
        ...standard,
        unit,
        quantity,
        expiry,
        notes: itemNotes.join('\n') || null,
      });
    }
  }

  // One row per product: a second would split its stock. The sheets list a
  // few products twice — a second box put on its own line — so those merge.
  const merged = new Map<string, ImportedItem>();
  for (const item of items) {
    if (!item.name) {
      notes.push({ source: item.source, level: 'error', message: 'no name' });
      continue;
    }
    const key = identityKey(item);
    const first = merged.get(key);
    if (!first) {
      merged.set(key, item);
      continue;
    }
    if (first.unit !== item.unit) {
      notes.push({
        source: item.source,
        level: 'error',
        message: `same item as ${first.source}, counted in ${item.unit} there in ${first.unit}`,
      });
      continue;
    }
    notes.push({
      source: item.source,
      level: 'review',
      message: `same item as ${first.source} — merged: ${first.quantity} + ${item.quantity}`,
    });
    first.quantity += item.quantity;
    if (
      item.expiry &&
      (!first.expiry || item.expiry.date < first.expiry.date)
    ) {
      first.expiry = item.expiry;
    }
    first.notes = [first.notes, item.notes].filter(Boolean).join('\n') || null;
  }
  return { items: [...merged.values()], notes };
}

function headersMatch(
  section: Section,
  sheet: RawSheet,
  notes: ImportNote[],
): boolean {
  const columns: Array<Column | undefined> = [
    section.name,
    section.brand,
    section.nameOrBrand,
    section.quantity,
    section.expiry,
    section.price,
    ...(section.spec ?? []).map((s) => s.column),
  ];
  let ok = true;
  for (const column of columns) {
    if (!column || column[1] === null) continue;
    const found = text(sheet.cell(section.headerRow, columnIndex(column[0])));
    if (found !== column[1]) {
      notes.push({
        source: `${section.sheet}!${column[0]}${section.headerRow}`,
        level: 'error',
        message: `expected the header "${column[1]}", found "${found}" — has a column moved?`,
      });
      ok = false;
    }
  }
  return ok;
}

/**
 * A size, model or shade. Excel reads «6/5» — six and a half, written with a
 * Persian decimal slash — as the fifth of June; such a cell is turned back
 * into what was typed, and listed.
 */
function specText(
  cell: RawCell,
  column: SpecColumn,
  at: string,
  notes: ImportNote[],
): string {
  if (!(cell.value instanceof Date)) return text(cell);
  const month = cell.value.getUTCMonth() + 1;
  const day = cell.value.getUTCDate();
  const typed = `${month}/${day}`;
  const value = column.decimal ? `${month}.${day}` : typed;
  notes.push({
    source: at,
    level: 'review',
    message: `Excel had turned "${typed}" into a date; read back as ${value}`,
  });
  return value;
}

function readQuantity(
  cell: RawCell,
  at: string,
  notes: ImportNote[],
  itemNotes: string[],
): { quantity: number; unit: InventoryUnit } {
  const piece = InventoryUnit.Piece;
  if (isBlank(cell)) {
    notes.push({
      source: at,
      level: 'review',
      message: 'no quantity — imported as 0, count the shelf',
    });
    return { quantity: 0, unit: piece };
  }
  if (typeof cell.value === 'number' && Number.isInteger(cell.value)) {
    if (cell.value >= 0) return { quantity: cell.value, unit: piece };
  }
  const raw = text(cell);
  const match = /^(\d+|[^\d\s]+)\s*([^\d\s]+)?$/.exec(toLatinDigits(raw));
  if (match) {
    const count = /^\d+$/.test(match[1])
      ? Number(match[1])
      : NUMBER_WORDS[match[1]];
    const unit = match[2] ? UNIT_WORDS[match[2]] : piece;
    if (count !== undefined && unit !== undefined) {
      if (raw !== String(count)) {
        notes.push({
          source: at,
          level: 'info',
          message: `quantity "${raw}" read as ${count} ${unit}`,
        });
      }
      return { quantity: count, unit };
    }
  }
  notes.push({
    source: at,
    level: 'review',
    message: `quantity "${raw}" is not a count — imported as 0, kept in the notes`,
  });
  itemNotes.push(`تعداد: ${raw}`);
  return { quantity: 0, unit: piece };
}

/**
 * An expiry: a date Excel parsed (a month-only one if its format shows no
 * day), a bare year, or Jalali text such as «1407/5».
 */
function readExpiry(
  cell: RawCell,
  at: string,
  notes: ImportNote[],
  itemNotes: string[],
): Expiry | null {
  let written: string;
  if (cell.value instanceof Date) {
    const d = cell.value;
    const date = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}`;
    written = /d/i.test(cell.numFmt ?? 'd')
      ? `${date}/${pad(d.getUTCDate())}`
      : date;
  } else {
    written = text(cell);
  }
  const expiry = parseExpiry(written);
  if (!expiry) {
    notes.push({
      source: at,
      level: 'review',
      message: `expiry "${written}" is not a date — kept in the notes`,
    });
    itemNotes.push(`تاریخ: ${written}`);
    return null;
  }
  if (!expiry.text.includes('/')) {
    notes.push({
      source: at,
      level: 'review',
      message: `expiry "${expiry.text}" gives only a year — warned on as the end of it; check the pack`,
    });
  }
  return expiry;
}
