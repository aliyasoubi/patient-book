import { describe, expect, it } from '@jest/globals';

import {
  count,
  expiryState,
  fefo,
  identityKey,
  inventorySearchKey,
  itemSearchText,
  LotLevel,
  nearestExpiry,
  normalizeLot,
  parseExpiry,
  receive,
  stockState,
  take,
} from './inventory-stock';

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('parseExpiry', () => {
  it('reads a printed Gregorian month as running to its last day', () => {
    const e = parseExpiry('2028-07')!;
    expect(e.text).toBe('2028/07');
    expect(iso(e.date)).toBe('2028-07-31');
  });

  it('reads the month-first order printers use', () => {
    expect(parseExpiry('07/2028')?.text).toBe('2028/07');
    expect(parseExpiry('31.07.2028')?.text).toBe('2028/07/31');
  });

  it('knows February', () => {
    expect(iso(parseExpiry('2028/2')!.date)).toBe('2028-02-29');
    expect(iso(parseExpiry('2027/2')!.date)).toBe('2027-02-28');
  });

  it('reads a Jalali expiry in Persian digits, by its year', () => {
    const e = parseExpiry('۱۴۰۷/۵')!;
    expect(e.text).toBe('1407/05');
    // The 31st of Mordad 1407.
    expect(iso(e.date)).toBe('2028-08-21');
  });

  it('takes a bare year as the whole year, keeping it bare', () => {
    const e = parseExpiry('2028')!;
    expect(e.text).toBe('2028');
    expect(iso(e.date)).toBe('2028-12-31');
  });

  it('keeps a full date to the day', () => {
    expect(iso(parseExpiry('2028/05/16')!.date)).toBe('2028-05-16');
  });

  it.each([
    '',
    '  ',
    'soon',
    '28/07',
    '2028/13',
    '2028/02/30',
    '1407/12/31',
    '3000',
  ])('refuses %p rather than guess', (value) => {
    expect(parseExpiry(value)).toBeNull();
  });
});

describe('stockState', () => {
  it('is out at zero, whatever the reorder level', () => {
    expect(stockState(0, null)).toBe('out');
    expect(stockState(0, 3)).toBe('out');
  });

  it('is low at or under the level staff set, and only then', () => {
    expect(stockState(3, 3)).toBe('low');
    expect(stockState(4, 3)).toBe('ok');
    expect(stockState(1, null)).toBe('ok');
  });
});

describe('expiryState', () => {
  const now = new Date(2026, 9, 8);

  it('has nothing to say about an empty shelf or an undated item', () => {
    expect(expiryState('2020-01-01', 0, now)).toBeNull();
    expect(expiryState(null, 5, now)).toBeNull();
  });

  it('is expired from the day after its last day', () => {
    expect(expiryState('2026-10-08', 1, now)).toBe('expiring');
    expect(expiryState('2026-10-07', 1, now)).toBe('expired');
  });

  it('warns within ninety days', () => {
    expect(expiryState('2027-01-06', 1, now)).toBe('expiring');
    expect(expiryState('2027-01-07', 1, now)).toBe('ok');
  });
});

/** A batch: `expiry` as printed, arriving `day` days into the month. */
const lot = (
  id: string,
  quantity: number,
  expiry: string | null,
  day = 1,
  lotNumber: string | null = null,
): LotLevel => {
  const parsed = expiry ? parseExpiry(expiry) : null;
  return {
    id,
    lotNumber,
    quantity,
    expiresOn: parsed?.date ?? null,
    expiryText: parsed?.text ?? null,
    createdAt: new Date(2026, 0, day),
  };
};
const ids = (changes: Array<{ lot: LotLevel; change: number }>) =>
  changes.map(({ lot, change }) => [lot.id, change]);

describe('fefo', () => {
  it('puts the soonest expiry first, undated last, then the first to arrive', () => {
    const order = fefo([
      lot('undated', 1, null),
      lot('late', 1, '2029/01'),
      lot('soon-second', 1, '2027/01', 5),
      lot('soon-first', 1, '2027/01', 2),
    ]).map((l) => l.id);
    expect(order).toEqual(['soon-first', 'soon-second', 'late', 'undated']);
  });
});

describe('nearestExpiry', () => {
  it('is the first-expiring batch still on the shelf', () => {
    expect(
      nearestExpiry([
        lot('a', 0, '2026/01'),
        lot('b', 3, '2027/06'),
        lot('c', 1, null),
      ]).expiryText,
    ).toBe('2027/06');
    expect(nearestExpiry([lot('a', 0, '2026/01')]).expiryText).toBeNull();
  });
});

describe('normalizeLot', () => {
  it('reads one lot number one way', () => {
    expect(normalizeLot(' ab۱۲  3 ')).toBe('AB12 3');
    expect(normalizeLot('  ')).toBeNull();
  });
});

describe('receive', () => {
  it('adds to the batch with the same lot and expiry', () => {
    const lots = [lot('a', 2, '2027/01', 1, 'X1')];
    const change = receive(lots, {
      quantity: 5,
      lotNumber: 'x1',
      expiry: parseExpiry('2027-01'),
    });
    expect(change).toEqual({ lot: lots[0], change: 5 });
  });

  it('opens a new batch for another lot or expiry', () => {
    const change = receive([lot('a', 2, '2027/01', 1, 'X1')], {
      quantity: 5,
      lotNumber: 'X2',
      expiry: parseExpiry('2029/03'),
    });
    expect(change.lot).toMatchObject({
      id: null,
      lotNumber: 'X2',
      expiryText: '2029/03',
      quantity: 0,
    });
    expect(change.change).toBe(5);
  });
});

describe('take', () => {
  const shelf = [lot('late', 5, '2029/01'), lot('soon', 2, '2027/01')];

  it('takes first-expiring first, across batches', () => {
    expect(ids(take(shelf, 3))).toEqual([
      ['soon', -2],
      ['late', -1],
    ]);
  });

  it('takes from the batch named', () => {
    expect(ids(take(shelf, 3, 'late'))).toEqual([['late', -3]]);
  });

  it('refuses more than the shelf, or the batch, holds', () => {
    expect(() => take(shelf, 8)).toThrow(
      expect.objectContaining({ params: { available: 7 } }),
    );
    expect(() => take(shelf, 3, 'soon')).toThrow(
      expect.objectContaining({ params: { available: 2 } }),
    );
  });
});

describe('count', () => {
  it('takes what is missing from the first-expiring batches', () => {
    const shelf = [lot('late', 5, '2029/01'), lot('soon', 2, '2027/01')];
    expect(ids(count(shelf, 4))).toEqual([
      ['soon', -2],
      ['late', -1],
    ]);
  });

  it('adds what is found to the last batch to arrive', () => {
    const shelf = [lot('first', 1, '2027/01', 1), lot('last', 1, '2029/01', 9)];
    expect(ids(count(shelf, 5))).toEqual([['last', 3]]);
  });

  it('opens an undated batch on an empty record, and changes nothing when right', () => {
    const [opened] = count([], 4);
    expect(opened.lot).toMatchObject({ id: null, expiryText: null });
    expect(opened.change).toBe(4);
    expect(count([lot('a', 3, null)], 3)).toEqual([]);
  });
});

describe('inventorySearchKey', () => {
  it('folds the ways a size is written on the shelf into one', () => {
    const forms = ['4x10', '4 x 10', '4*10', '4-10', '4×10'];
    for (const form of forms) expect(inventorySearchKey(form)).toBe('4x10');
    expect(inventorySearchKey('4/1-10')).toBe(inventorySearchKey('4.1x10'));
  });

  it('leaves letters and words alone', () => {
    expect(inventorySearchKey('SLA-BLT-RC')).toBe('sla-blt-rc');
  });
});

describe('itemSearchText', () => {
  it('finds a Latin implant brand by the Persian name staff type', () => {
    const text = itemSearchText({
      name: 'SLA Active_BL',
      brand: 'Straumann',
      spec: '4.1-10',
      notes: null,
    });
    expect(text).toContain(inventorySearchKey('اشترومن'));
    expect(text).toContain('4.1x10');
  });

  it('adds nothing for a brand it does not know', () => {
    expect(
      itemSearchText({
        name: 'پودر استخوان',
        brand: 'Acme',
        spec: null,
        notes: null,
      }),
    ).toBe(inventorySearchKey('پودر استخوان Acme'));
  });
});

describe('identityKey', () => {
  it('treats spellings that differ only in folding as the same item', () => {
    const a = identityKey({
      category: 'implant',
      name: 'Supe Line',
      brand: 'Dentium',
      spec: '4x10',
    });
    const b = identityKey({
      category: 'implant',
      name: 'supe  line',
      brand: 'DENTIUM',
      spec: '4 x 10',
    });
    expect(a).toBe(b);
  });
});
