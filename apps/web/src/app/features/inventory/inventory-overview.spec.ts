import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '../../core/models/common.model';
import { filterCounts, shelfBrands, shelfFlags } from './inventory-overview';

const item = (over: Partial<InventoryItem>): InventoryItem =>
  ({
    quantity: 5,
    minQuantity: null,
    stockState: 'ok',
    expiryState: null,
    ...over,
  }) as InventoryItem;

const items = [
  item({ quantity: 0, minQuantity: 2, stockState: 'out' }),
  item({ quantity: 0, stockState: 'out' }),
  item({ quantity: 2, minQuantity: 2, stockState: 'low' }),
  item({ quantity: 9, minQuantity: 2, expiryState: 'expiring' }),
  item({ quantity: 3, expiryState: 'expired' }),
  item({ quantity: 3, expiryState: 'ok' }),
];

describe('filterCounts', () => {
  it('counts each list the way the API filters it', () => {
    // Reorder is "at or under a level that was set": an empty shelf with no level is not in it.
    expect(filterCounts(items)).toEqual({ reorder: 2, out: 2, expiry: 2 });
  });

  it('is zero for an empty shelf', () => {
    expect(filterCounts([])).toEqual({ reorder: 0, out: 0, expiry: 0 });
  });
});

describe('shelfFlags', () => {
  it('counts each item once as out or low, and once as expired or expiring', () => {
    expect(shelfFlags(items)).toEqual({ out: 2, low: 1, expired: 1, expiring: 1 });
  });

  it('is quiet for a shelf with nothing to flag', () => {
    expect(shelfFlags([item({}), item({ expiryState: 'ok' })])).toEqual({
      out: 0,
      low: 0,
      expired: 0,
      expiring: 0,
    });
  });
});

describe('shelfBrands', () => {
  const shelf = (brands: (string | null)[]) => brands.map((brand) => item({ brand }));

  it('offers a long shelf its brands, in the order its rows come', () => {
    const rows = shelf([
      ...Array<null>(2).fill(null),
      ...Array<string>(10).fill('Dentium'),
      ...Array<string>(10).fill('Straumann'),
    ]);
    expect(shelfBrands(rows)).toEqual(['Dentium', 'Straumann']);
  });

  it('offers nothing for a short shelf, or one of a single brand', () => {
    expect(shelfBrands(shelf(['Dentium', 'Straumann']))).toEqual([]);
    expect(shelfBrands(shelf([...Array<string>(30).fill('GC'), null]))).toEqual([]);
  });
});
