import { ErrorCode } from '../errors/error-code';
import { InvalidInputError } from '../errors/domain.error';
import { JalaliDate, storedDate } from './jalali-date';

/** Narrow a parse result to the success branch, failing loudly if it is not. */
const parsed = (input: string): JalaliDate => {
  const result = JalaliDate.tryParse(input);
  if (!(result instanceof JalaliDate)) {
    throw new Error(`expected "${input}" to parse, got ${result.code}`);
  }
  return result;
};

/** Narrow to the failure branch and return its code. */
const failure = (input: string | null | undefined): ErrorCode => {
  const result = JalaliDate.tryParse(input);
  if (result instanceof JalaliDate)
    throw new Error(`expected "${input}" to fail`);
  return result.code;
};

describe('JalaliDate.tryParse', () => {
  it('parses a full date and round-trips it', () => {
    const d = parsed('1368/05/12');
    expect(d.precision).toBe('day');
    expect(d.format()).toBe('1368/05/12');
    // 12 Mordad 1368 is 3 August 1989.
    expect(d.toIsoDate()).toBe('1989-08-03');
  });

  it.each([
    ['1400/2/9', '1400/02/09'],
    ['1404-06-11', '1404/06/11'],
    ['۱۴۰۴/۰۶/۱۱', '1404/06/11'],
    ['1404 / 06 / 11', '1404/06/11'],
  ])('accepts %s', (input, expected) => {
    expect(parsed(input).format()).toBe(expected);
  });

  describe('precision', () => {
    it('records a bare year as year precision, not a fabricated 1 Farvardin', () => {
      const d = parsed('1368');
      expect(d.precision).toBe('year');
      expect(d.format()).toBe('1368');
    });

    it('records year/month as month precision', () => {
      const d = parsed('1365/8');
      expect(d.precision).toBe('month');
      expect(d.format()).toBe('1365/08');
    });
  });

  describe('two-digit years', () => {
    it('expands the shorthand the practice actually uses', () => {
      expect(parsed('99/05/15').format()).toBe('1399/05/15');
      expect(parsed('05/06/11').format()).toBe('1405/06/11');
    });

    it('refuses an ambiguous three-digit year rather than guessing', () => {
      expect(failure('140/11/2')).toBe(ErrorCode.DateAmbiguousYear);
    });
  });

  describe('calendar validity', () => {
    it('reports the specific rule that was broken', () => {
      expect(failure('1403/20/19')).toBe(ErrorCode.DateMonthInvalid);
      expect(failure('1371/4/45')).toBe(ErrorCode.DateDayInvalid);
      expect(failure('آذر ماه')).toBe(ErrorCode.DateNonNumeric);
      expect(failure('1992/11/12')).toBe(ErrorCode.DateYearOutOfRange);
    });

    it('knows the first six months have 31 days', () => {
      expect(parsed('1403/06/31').format()).toBe('1403/06/31');
    });

    it('knows months seven to eleven have 30', () => {
      expect(parsed('1399/09/30').format()).toBe('1399/09/30');
      expect(failure('1399/09/31')).toBe(ErrorCode.DateNotOnCalendar);
    });

    it('accepts 30 Esfand only in a leap year', () => {
      expect(parsed('1403/12/30').format()).toBe('1403/12/30');
      expect(failure('1402/12/30')).toBe(ErrorCode.DateNotOnCalendar);
    });
  });

  it.each([null, undefined, '', '   ', '_', '-'])('treats %p as empty', (v) => {
    expect(failure(v as string)).toBe(ErrorCode.DateEmpty);
  });
});

describe('JalaliDate.parse', () => {
  it('throws a domain error carrying the code and its parameters', () => {
    expect(() => JalaliDate.parse('1403/20/19')).toThrow(InvalidInputError);
    try {
      JalaliDate.parse('1403/20/19');
    } catch (error) {
      const domain = error as InvalidInputError;
      expect(domain.code).toBe(ErrorCode.DateMonthInvalid);
      expect(domain.params).toMatchObject({ month: 20 });
    }
  });

  it('carries no translated prose — only a developer message', () => {
    try {
      JalaliDate.parse('1371/4/45');
    } catch (error) {
      expect((error as Error).message).toMatch(/^Cannot read/);
    }
  });
});

describe('storedDate', () => {
  it('reads a date-only column value as a local calendar day', () => {
    // `new Date('2025-09-23')` is UTC midnight, which west of Greenwich is
    // still the 22nd locally. The result must not depend on the host's zone.
    const d = storedDate('2025-09-23');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2025, 8, 23]);
    expect(JalaliDate.fromStored('2025-09-23')?.format()).toBe('1404/07/01');
  });

  it('passes a Date or a full timestamp through unchanged', () => {
    const date = new Date(2025, 8, 23, 10, 30);
    expect(storedDate(date)).toBe(date);
    expect(storedDate('2025-09-23T10:30:00.000Z').toISOString()).toBe(
      '2025-09-23T10:30:00.000Z',
    );
  });
});

describe('toIsoDate', () => {
  it('uses local calendar components, not UTC', () => {
    // Tehran is UTC+3:30: toISOString() on a local-midnight date returns the
    // previous day, which would shift every stored date in the register.
    const d = JalaliDate.fromDate(new Date(1989, 7, 3, 0, 0, 0));
    expect(d?.toIsoDate()).toBe('1989-08-03');
  });
});

describe('ageInYears', () => {
  it('counts whole years, not started ones', () => {
    const now = new Date(2026, 5, 15);
    const born = JalaliDate.fromDate(new Date(1996, 5, 16));
    expect(born?.ageInYears(now)).toBe(29);
  });

  it('rejects an implausible age rather than returning a negative number', () => {
    const future = JalaliDate.fromDate(new Date(Date.now() + 86_400_000 * 400));
    expect(future?.ageInYears()).toBeNull();
  });
});

describe('isValid', () => {
  it('is true only for real calendar dates', () => {
    expect(JalaliDate.isValid('1403/12/30')).toBe(true);
    expect(JalaliDate.isValid('1402/12/30')).toBe(false);
  });
});
