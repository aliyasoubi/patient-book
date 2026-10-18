import type { InventoryItem } from '../../core/models/common.model';

/**
 * What the stock list counts for the eye: the three questions the API answers
 * as filters, and — per shelf — which of its items need a look and which
 * brands it can be narrowed to.
 */

/** A shelf shorter than this is read whole; brand chips would only be clutter. */
const BRAND_CHIPS_FROM = 20;

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

/**
 * The brands a long shelf can be narrowed to — implants, a few systems with
 * dozens of sizes each — in the order its rows come, since the API sorts a
 * shelf by brand. Empty for a short shelf, or one of a single brand.
 */
export function shelfBrands(items: readonly InventoryItem[]): string[] {
  if (items.length < BRAND_CHIPS_FROM) return [];
  const brands = new Set<string>();
  for (const item of items) if (item.brand) brands.add(item.brand);
  return brands.size > 1 ? [...brands] : [];
}
