import type { InventoryItem } from '../../core/models/common.model';

/**
 * What the stock list counts for the eye: the three questions the API answers
 * as filters, and — per shelf — which of its items need a look.
 */

/** How many items each list filter would show: the same rules as the API's. */
export interface FilterCounts {
  reorder: number;
  out: number;
  expiry: number;
}

/** A shelf's items that ask for attention; each item is in at most one stock count. */
export interface ShelfFlags {
  out: number;
  low: number;
  expired: number;
  expiring: number;
}

export function filterCounts(items: readonly InventoryItem[]): FilterCounts {
  const counts: FilterCounts = { reorder: 0, out: 0, expiry: 0 };
  for (const item of items) {
    if (item.minQuantity !== null && item.quantity <= item.minQuantity) counts.reorder++;
    if (item.quantity === 0) counts.out++;
    if (item.expiryState === 'expiring' || item.expiryState === 'expired') counts.expiry++;
  }
  return counts;
}

export function shelfFlags(items: readonly InventoryItem[]): ShelfFlags {
  const flags: ShelfFlags = { out: 0, low: 0, expired: 0, expiring: 0 };
  for (const item of items) {
    if (item.stockState === 'out') flags.out++;
    else if (item.stockState === 'low') flags.low++;
    if (item.expiryState === 'expired') flags.expired++;
    else if (item.expiryState === 'expiring') flags.expiring++;
  }
  return flags;
}
