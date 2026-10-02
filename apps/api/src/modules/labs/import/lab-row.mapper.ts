import type { SheetRow } from '../../../application/ports/workbook.port';
import {
  extractImplantBrand,
  JalaliDate,
  LabTripKind,
  LabWorkType,
  normalizeForDisplay,
  searchKey,
  toLatinDigits,
} from '../../../domain';
import type { LabStage } from '../lab-stage';

/**
 * The lab book's columns, by header. Matched on the folded text so a stray
 * space or a ZWNJ in the sheet does not lose a column.
 */
export const LAB_SHEET_COLUMNS = {
  name: 'نام بیمار',
  work: 'نوع کار ارسال شده',
  toothCount: 'تعداد دندان ها',
  teeth: 'شماره دندان ها',
  lab: 'نام لابراتوار',
  impressions: 'تعداد ایمپرشن',
  analogs: 'تعداد آنالوگ',
  brand: 'برند ایمپلنت',
  parts: 'وضعیت تحویل آنالوگ و ایمپرشن',
  sentAt: 'تاریخ ارسال',
  wait: 'مدت زمان انتظار',
  status: 'وضعیت',
} as const;
export type LabSheetColumn = keyof typeof LAB_SHEET_COLUMNS;

/** 1-based column index of each known header, or the headers it could not find. */
export function locateColumns(
  header: readonly string[],
):
  | { ok: true; columns: Record<LabSheetColumn, number> }
  | { ok: false; missing: string[] } {
  const index = new Map(header.map((text, i) => [searchKey(text), i + 1]));
  const columns = {} as Record<LabSheetColumn, number>;
  const missing: string[] = [];
  for (const [key, title] of Object.entries(LAB_SHEET_COLUMNS)) {
    const column = index.get(searchKey(title));
    if (column) columns[key as LabSheetColumn] = column;
    else missing.push(title);
  }
  return missing.length ? { ok: false, missing } : { ok: true, columns };
}

/** One row of the lab book, read into what a case and its first trip need. */
export interface LabSheetCase {
  rowNumber: number;
  recordedName: string;
  labName: string;
  workTypes: LabWorkType[];
  toothCount: number | null;
  teeth: string;
  implantBrand: string | null;
  impressionCount: number | null;
  analogCount: number | null;
  partsReturnedAt: Date | null;
  tripKind: LabTripKind;
  sentAt: Date;
  waitDays: number;
  /** Where the book says the work is. */
  stage: LabStage;
  /** What the row said that does not fit a field, kept on the case's notes. */
  leftovers: string[];
  /** Assumptions made reading the row, for the operator to check. */
  warnings: string[];
}

export type LabSheetRowResult =
  | { kind: 'case'; value: LabSheetCase }
  | { kind: 'skipped'; rowNumber: number; recordedName: string; reason: string }
  | { kind: 'empty'; rowNumber: number };

/** «û» is the book's "does not apply"; a blank is the same. */
const NOT_APPLICABLE = new Set(['', 'û', '-', '—']);

const cellText = (row: SheetRow, column: number): string =>
  normalizeForDisplay(row.cell(column)).trim();

/**
 * Work types from «لمینیت و روکش ایمپلنت»-style text. Implant is checked
 * before crown: «روکش ایمپلنت» contains «روکش».
 */
export function parseWorkTypes(raw: string): {
  types: LabWorkType[];
  unknown: string[];
} {
  const types = new Set<LabWorkType>();
  const unknown: string[] = [];
  for (const part of raw.split(/\s+و\s+|[،,+/]/)) {
    const key = searchKey(part);
    if (!key) continue;
    if (key.includes('ایمپلنت')) types.add(LabWorkType.ImplantCrown);
    else if (key.includes('روکش') || key.includes('زیرکونیا'))
      types.add(LabWorkType.Crown);
    else if (key.includes('لمینیت') || key.includes('ونیر'))
      types.add(LabWorkType.Laminate);
    else if (key.includes('پست')) types.add(LabWorkType.Post);
    else if (key.includes('نایت') || key.includes('گارد'))
      types.add(LabWorkType.NightGuard);
    else if (key === 'sx') types.add(LabWorkType.Sx);
    else unknown.push(part.trim());
  }
  return { types: [...types], unknown };
}

/**
 * What the trip went for, from the status text: «ارسال رزین به لابراتوار» is
 * a resin trip, plain «ارسال به لابراتوار» the impression.
 */
export function parseTripKind(status: string): LabTripKind {
  const key = searchKey(status);
  if (key.includes('رزین')) return LabTripKind.Resin;
  if (key.includes('فریم')) return LabTripKind.Frame;
  if (key.includes('اسکن')) return LabTripKind.Scan;
  if (key.includes('موم') || key.includes('الژینات'))
    return LabTripKind.WaxAlginate;
  if (key.includes('اصلاح')) return LabTripKind.Correction;
  if (key.includes('تکرار')) return LabTripKind.Remake;
  return LabTripKind.Impression;
}

/** Where the work is, from the status text. Anything not "back" is still at the lab. */
export function parseStage(status: string): LabStage {
  const key = searchKey(status);
  if (key.includes('تحویل به بیمار')) return 'delivered';
  if (key.includes('تحویل از')) return 'at_clinic';
  return 'at_lab';
}

const WORD_NUMBERS: Record<string, number> = {
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
};

/** «یک هفته» → 7, «۱۰ روز» → 10; `null` when it says neither. */
export function parseWaitDays(raw: string): number | null {
  const key = searchKey(raw);
  const match = /^(\d+|[^\s]+)\s*(هفته|روز)$/.exec(key);
  if (!match) return null;
  const n = /^\d+$/.test(match[1]) ? Number(match[1]) : WORD_NUMBERS[match[1]];
  if (!n) return null;
  const days = match[2] === 'هفته' ? n * 7 : n;
  return days >= 1 && days <= 90 ? days : null;
}

function parseCount(raw: string, min: number, max: number): number | null {
  const value = toLatinDigits(raw).trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

const DATE_IN_TEXT = /(\d{4}\/\d{1,2}\/\d{1,2})/;

/**
 * Read one row of the lab book. A row that cannot become a case — no work
 * type, no lab, no send date — is skipped with the reason; nothing about it
 * is guessed. Everything else that had to be assumed is listed as a warning.
 */
export function mapLabRow(
  row: SheetRow,
  columns: Record<LabSheetColumn, number>,
): LabSheetRowResult {
  const read = (column: LabSheetColumn) => cellText(row, columns[column]);
  const recordedName = read('name').slice(0, 160);
  const work = read('work');
  const labName = read('lab');
  const sent = read('sentAt');

  const everything = (Object.keys(columns) as LabSheetColumn[]).map(read);
  if (everything.every((v) => NOT_APPLICABLE.has(v))) {
    return { kind: 'empty', rowNumber: row.rowNumber };
  }
  const skip = (reason: string): LabSheetRowResult => ({
    kind: 'skipped',
    rowNumber: row.rowNumber,
    recordedName,
    reason,
  });
  if (!recordedName) return skip('no patient name');

  const { types, unknown } = parseWorkTypes(work);
  if (!types.length)
    return skip(work ? `unknown work type «${work}»` : 'no work type');
  if (!labName) return skip('no lab');
  if (!sent) return skip('no send date');
  const sentAt = JalaliDate.tryParse(sent);
  if (!(sentAt instanceof JalaliDate) || sentAt.precision !== 'day') {
    return skip(`send date «${sent}» is not a full Jalali date`);
  }

  const warnings: string[] = [];
  const leftovers: string[] = [];
  if (unknown.length) {
    warnings.push(
      `work type «${unknown.join('، ')}» not recognised; kept in notes`,
    );
    leftovers.push(`نوع کار در دفتر: ${work}`);
  }

  const waitRaw = read('wait');
  let waitDays = parseWaitDays(waitRaw);
  if (waitDays === null) {
    waitDays = 7;
    warnings.push(
      waitRaw
        ? `wait «${waitRaw}» not understood; one week assumed`
        : 'no wait time; one week assumed',
    );
  }

  const toothRaw = read('toothCount');
  const toothCount = parseCount(toothRaw, 1, 32);
  if (toothCount === null && !NOT_APPLICABLE.has(toothRaw)) {
    warnings.push(`tooth count «${toothRaw}» not a number; left empty`);
  }

  const impressionCount = parseCount(read('impressions'), 0, 32);
  const analogCount = parseCount(read('analogs'), 0, 32);

  const brandRaw = read('brand');
  const implantBrand = NOT_APPLICABLE.has(brandRaw)
    ? null
    : extractImplantBrand(brandRaw);
  if (!NOT_APPLICABLE.has(brandRaw) && !implantBrand) {
    warnings.push(`implant brand «${brandRaw}» not recognised; kept in notes`);
    leftovers.push(`برند در دفتر: ${brandRaw}`);
  }

  // «تحویل گرفته شد در تاریخ ۱۴۰۵/۰۷/۰۶»: the parts are back, on that day.
  const partsRaw = read('parts');
  let partsReturnedAt: Date | null = null;
  if (!NOT_APPLICABLE.has(partsRaw)) {
    const date = DATE_IN_TEXT.exec(toLatinDigits(partsRaw))?.[1];
    const parsed = date ? JalaliDate.tryParse(date) : null;
    if (parsed instanceof JalaliDate) partsReturnedAt = parsed.date;
    else {
      warnings.push(`parts status «${partsRaw}» has no date; kept in notes`);
      leftovers.push(`وضعیت قطعات در دفتر: ${partsRaw}`);
    }
  }

  const status = read('status');
  if (!status) warnings.push('no status; taken as still at the lab');

  return {
    kind: 'case',
    value: {
      rowNumber: row.rowNumber,
      recordedName,
      labName,
      workTypes: types,
      toothCount,
      teeth: NOT_APPLICABLE.has(read('teeth'))
        ? ''
        : read('teeth').slice(0, 200),
      implantBrand,
      impressionCount,
      analogCount,
      partsReturnedAt,
      tripKind: parseTripKind(status),
      sentAt: sentAt.date,
      waitDays,
      stage: parseStage(status),
      leftovers,
      warnings,
    },
  };
}
