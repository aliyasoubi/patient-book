import { describe, expect, it } from '@jest/globals';

import { InventoryMovementKind } from '../../domain';
import {
  applyMovement,
  expiryState,
  identityKey,
  inventorySearchKey,
  parseExpiry,
  StockLevel,
  stockState,
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

describe('applyMovement', () => {
  const level = (
    quantity: number,
    expiryText: string | null = null,
  ): StockLevel => ({
    quantity,
    expiryText,
    expiresOn: expiryText ? parseExpiry(expiryText)!.date : null,
  });

  it('adds a delivery, keeping the earlier expiry of what was already there', () => {
    const r = applyMovement(level(3, '2027/01'), {
      kind: InventoryMovementKind.Receive,
      quantity: 10,
      expiry: parseExpiry('2029/06'),
    });
    expect(r).toMatchObject({
      change: 10,
      quantity: 13,
      expiryText: '2027/01',
    });
  });

  it('takes a delivery’s expiry when it is the earlier one', () => {
    const r = applyMovement(level(3, '2029/01'), {
      kind: InventoryMovementKind.Receive,
      quantity: 1,
      expiry: parseExpiry('2027/06'),
    });
    expect(r.expiryText).toBe('2027/06');
  });

  it('replaces a used-up batch’s expiry on an empty shelf, even with none', () => {
    const empty = level(0, '2025/01');
    expect(
      applyMovement(empty, {
        kind: InventoryMovementKind.Receive,
        quantity: 5,
        expiry: parseExpiry('2029/06'),
      }).expiryText,
    ).toBe('2029/06');
    expect(
      applyMovement(empty, { kind: InventoryMovementKind.Receive, quantity: 5 })
        .expiryText,
    ).toBeNull();
  });

  it('takes out what is used or discarded', () => {
    const r = applyMovement(level(4, '2027/01'), {
      kind: InventoryMovementKind.Use,
      quantity: 4,
    });
    expect(r).toMatchObject({ change: -4, quantity: 0, expiryText: '2027/01' });
  });

  it('refuses to take out more than there is', () => {
    expect(() =>
      applyMovement(level(2), {
        kind: InventoryMovementKind.Discard,
        quantity: 3,
      }),
    ).toThrow(expect.objectContaining({ params: { available: 2 } }));
  });

  it('sets the balance to a count, recording the difference', () => {
    expect(
      applyMovement(level(7, '2027/01'), {
        kind: InventoryMovementKind.Count,
        quantity: 5,
      }),
    ).toMatchObject({ change: -2, quantity: 5, expiryText: '2027/01' });
    expect(
      applyMovement(level(5), {
        kind: InventoryMovementKind.Count,
        quantity: 5,
        expiry: parseExpiry('2028/03'),
      }),
    ).toMatchObject({ change: 0, quantity: 5, expiryText: '2028/03' });
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
