import { newDate } from 'date-fns-jalali';

import { consumptionWindow, monthlyAverage } from './material-consumption';

/** Local noon on a Jalali day; month is 1-based, as the practice writes it. */
const day = (y: number, m: number, d: number, hour = 12): Date => {
  const date = newDate(y, m - 1, d);
  date.setHours(hour);
  return date;
};

describe('consumptionWindow', () => {
  it('ends with this month and counts back, oldest first', () => {
    const { months, starts, end } = consumptionWindow(
      day(1405, 7, 29),
      6,
      null,
    );
    expect(months.map((m) => m.month)).toEqual([
      '1405/02',
      '1405/03',
      '1405/04',
      '1405/05',
      '1405/06',
      '1405/07',
    ]);
    expect(starts[0]).toEqual(day(1405, 2, 1, 0));
    expect(end).toEqual(day(1405, 8, 1, 0));
    expect(months.map((m) => m.current)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('crosses the new year', () => {
    const { months } = consumptionWindow(day(1406, 2, 3), 6, null);
    expect(months.map((m) => m.month)).toEqual([
      '1405/09',
      '1405/10',
      '1405/11',
      '1405/12',
      '1406/01',
      '1406/02',
    ]);
  });

  it('marks months before the first stock line as unrecorded, and the month it began in as partial', () => {
    const { months } = consumptionWindow(
      day(1405, 9, 10),
      6,
      day(1405, 7, 20, 9),
    );
    expect(months.map((m) => [m.month, m.tracked, m.trackedFromDay])).toEqual([
      ['1405/04', false, null],
      ['1405/05', false, null],
      ['1405/06', false, null],
      ['1405/07', true, 20],
      ['1405/08', true, null],
      ['1405/09', true, null],
    ]);
  });

  it('counts a month whose recording began on its first day as whole', () => {
    const { months } = consumptionWindow(
      day(1405, 9, 10),
      6,
      day(1405, 8, 1, 15),
    );
    expect(months.find((m) => m.month === '1405/08')).toMatchObject({
      tracked: true,
      trackedFromDay: null,
    });
  });
});

describe('monthlyAverage', () => {
  const { months } = consumptionWindow(day(1405, 10, 5), 6, day(1405, 7, 20));

  it('averages the complete months only — not the partial first one or the running one', () => {
    // 1405/05–06 unrecorded, 07 partial, 08 and 09 complete, 10 running.
    expect(monthlyAverage([0, 0, 3, 10, 15, 40], months)).toBe(12.5);
  });

  it('is null until a whole month is on record', () => {
    const early = consumptionWindow(
      day(1405, 8, 2),
      6,
      day(1405, 7, 20),
    ).months;
    expect(monthlyAverage([0, 0, 0, 0, 5, 1], early)).toBeNull();
  });

  it('rounds to one decimal', () => {
    const { months: two } = consumptionWindow(
      day(1405, 10, 5),
      6,
      day(1405, 1, 1),
    );
    expect(monthlyAverage([1, 2, 2, 2, 3, 9], two)).toBe(2);
    expect(monthlyAverage([1, 1, 2, 2, 1, 0], two)).toBe(1.4);
  });
});
