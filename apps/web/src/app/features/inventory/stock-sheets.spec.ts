import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '../../core/models/common.model';
import { changedLines, expiryEnd, isPast, suggestedOrder } from './stock-sheets';

const item = (id: string, quantity: number, minQuantity: number | null): InventoryItem =>
  ({ id, quantity, minQuantity }) as InventoryItem;

describe('changedLines', () => {
  const items = [item('a', 5, null), item('b', 2, 3), item('c', 1, 1)];

  it('sends only what differs from the record', () => {
    expect(
      changedLines(items, {
        a: { counted: '۴', min: '' },
        b: { counted: '2', min: '3' },
        c: { counted: '1', min: '2' },
      }),
    ).toEqual([
      { id: 'a', quantity: 4 },
      { id: 'c', minQuantity: 2 },
    ]);
  });

  it('reads a cleared level as no level, and a blank count as not counted', () => {
    expect(changedLines(items, { b: { counted: '', min: ' ' } })).toEqual([
      { id: 'b', minQuantity: null },
    ]);
  });

  it('ignores what is not a whole number', () => {
    expect(changedLines(items, { a: { counted: 'x', min: 'y' } })).toEqual([]);
  });
});

describe('suggestedOrder', () => {
  it('brings the shelf back to twice its reorder level, at least one', () => {
    expect(suggestedOrder({ quantity: 1, minQuantity: 3 })).toBe(5);
    expect(suggestedOrder({ quantity: 3, minQuantity: 3 })).toBe(3);
    expect(suggestedOrder({ quantity: 0, minQuantity: 0 })).toBe(1);
  });
});

describe('expiryEnd', () => {
  it('reads an expiry as the API does, to the end of the month it names', () => {
    expect(expiryEnd('2028/07')).toEqual(new Date(2028, 6, 31));
    expect(expiryEnd('07/2028')).toEqual(new Date(2028, 6, 31));
    expect(expiryEnd('2028/05/16')).toEqual(new Date(2028, 4, 16));
    expect(expiryEnd('۱۴۰۷/۰۵')?.getFullYear()).toBe(2028);
    expect(expiryEnd('soon')).toBeNull();
  });

  it('tells a date already behind us', () => {
    const now = new Date(2026, 9, 9);
    expect(isPast('2026/09', now)).toBe(true);
    expect(isPast('2026/10', now)).toBe(false);
    expect(isPast('', now)).toBe(false);
  });
});
