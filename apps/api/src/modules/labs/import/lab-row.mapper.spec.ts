import { describe, expect, it } from '@jest/globals';

import type { SheetRow } from '../../../application/ports/workbook.port';
import { JalaliDate, LabTripKind, LabWorkType } from '../../../domain';
import {
  LAB_SHEET_COLUMNS,
  locateColumns,
  mapLabRow,
  parseStage,
  parseTripKind,
  parseWaitDays,
  parseWorkTypes,
} from './lab-row.mapper';

// The book's header, in its own order; every name below is invented.
const HEADER = Object.values(LAB_SHEET_COLUMNS);
const located = locateColumns(HEADER);
if (!located.ok) throw new Error('header fixture is wrong');
const columns = located.columns;

const row = (
  rowNumber: number,
  cells: Partial<Record<keyof typeof LAB_SHEET_COLUMNS, string>>,
): SheetRow => ({
  rowNumber,
  cell: (column: number) => {
    const key = (Object.keys(columns) as Array<keyof typeof columns>).find(
      (k) => columns[k] === column,
    );
    return (key && cells[key]) ?? '';
  },
});

const base = {
  name: 'رضا آزمایشی',
  work: 'روکش زیرکونیا',
  lab: 'فرهنگ',
  sentAt: '1405/07/07',
  wait: 'یک هفته',
  status: 'ارسال به لابراتوار',
};

describe('locateColumns', () => {
  it('finds columns by header text in any order, through stray spaces and ZWNJ', () => {
    const shuffled = [...HEADER].reverse().map((h) => h.replace(' ها', '‌ها'));
    const result = locateColumns(shuffled);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns.name).toBe(HEADER.length);
  });

  it('names the columns it cannot find', () => {
    expect(locateColumns(['نام بیمار'])).toMatchObject({ ok: false });
  });
});

describe('parseWorkTypes', () => {
  it('reads every type the book writes, implant before plain crown', () => {
    expect(parseWorkTypes('لمینیت و روکش ایمپلنت').types).toEqual([
      LabWorkType.Laminate,
      LabWorkType.ImplantCrown,
    ]);
    expect(parseWorkTypes('روکش زیرکونیا و روکش ایمپلنت').types).toEqual([
      LabWorkType.Crown,
      LabWorkType.ImplantCrown,
    ]);
    expect(parseWorkTypes('نایت گارد نرم').types).toEqual([
      LabWorkType.NightGuard,
    ]);
    expect(parseWorkTypes('sx').types).toEqual([LabWorkType.Sx]);
  });

  it('reports what it does not know instead of guessing', () => {
    expect(parseWorkTypes('بریج')).toEqual({ types: [], unknown: ['بریج'] });
  });
});

describe('status, trip kind and wait', () => {
  it('reads where the work is and why it went from one status text', () => {
    expect(parseStage('ارسال رزین به لابراتوار')).toBe('at_lab');
    expect(parseTripKind('ارسال رزین به لابراتوار')).toBe(LabTripKind.Resin);
    expect(parseTripKind('ارسال اسکن برای لابراتوار')).toBe(LabTripKind.Scan);
    expect(parseTripKind('ارسال موم و آلژینات به لابراتوار')).toBe(
      LabTripKind.WaxAlginate,
    );
    expect(parseTripKind('ارسال به لابراتوار')).toBe(LabTripKind.Impression);
    expect(parseStage('تحویل از لابراتوار')).toBe('at_clinic');
    expect(parseStage('تحویل به بیمار')).toBe('delivered');
  });

  it('turns the book’s wait into days', () => {
    expect(parseWaitDays('یک هفته')).toBe(7);
    expect(parseWaitDays('سه هفته')).toBe(21);
    expect(parseWaitDays('۱۰ روز')).toBe(10);
    expect(parseWaitDays('زود')).toBeNull();
  });
});

describe('mapLabRow', () => {
  it('reads an implant crown with its parts, brand and returned date', () => {
    const result = mapLabRow(
      row(12, {
        ...base,
        work: 'روکش ایمپلنت',
        toothCount: '1',
        teeth: '6 بالا راست',
        impressions: '2',
        analogs: '2',
        brand: 'تی آر آی',
        parts: 'تحویل گرفته شد در تاریخ 1405/07/06',
        status: 'تحویل از لابراتوار',
      }),
      columns,
    );
    expect(result.kind).toBe('case');
    if (result.kind !== 'case') return;
    expect(result.value).toMatchObject({
      workTypes: [LabWorkType.ImplantCrown],
      toothCount: 1,
      impressionCount: 2,
      analogCount: 2,
      implantBrand: 'TRI',
      stage: 'at_clinic',
      tripKind: LabTripKind.Impression,
      waitDays: 7,
      warnings: [],
    });
    expect(JalaliDate.fromDate(result.value.partsReturnedAt!)!.format()).toBe(
      '1405/07/06',
    );
  });

  it('treats «û» as not applicable, not as a value', () => {
    const result = mapLabRow(
      row(3, {
        ...base,
        impressions: 'û',
        analogs: 'û',
        brand: 'û',
        parts: 'û',
      }),
      columns,
    );
    expect(result.kind === 'case' && result.value).toMatchObject({
      impressionCount: null,
      analogCount: null,
      implantBrand: null,
      partsReturnedAt: null,
      warnings: [],
    });
  });

  it('skips a row it cannot make a case of, saying why', () => {
    expect(mapLabRow(row(23, { ...base, work: '' }), columns)).toMatchObject({
      kind: 'skipped',
      reason: 'no work type',
    });
    expect(mapLabRow(row(24, { name: 'فقط نام' }), columns)).toMatchObject({
      kind: 'skipped',
    });
    expect(mapLabRow(row(25, {}), columns)).toEqual({
      kind: 'empty',
      rowNumber: 25,
    });
  });

  it('assumes a week when the wait is missing, and says so', () => {
    const result = mapLabRow(row(4, { ...base, wait: '' }), columns);
    expect(result.kind === 'case' && result.value.waitDays).toBe(7);
    expect(result.kind === 'case' && result.value.warnings).toEqual([
      'no wait time; one week assumed',
    ]);
  });
});
