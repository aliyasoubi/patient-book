import {
  endOfMonth as endOfJalaliMonth,
  endOfYear as endOfJalaliYear,
  isValid,
  parse as parseJalali,
} from 'date-fns-jalali';

import type { InventoryItem } from '../../core/models/common.model';
import type { InventoryCountLine } from '../../core/services/inventory.service';
import { toLatinDigits } from '../../shared/validators';

/** What a stocktake row holds as typed: the count on the shelf, and the reorder level. */
export interface CountRow {
  counted: string;
  min: string;
}

const whole = (raw: string): number | null => {
  const value = toLatinDigits(raw).trim();
  return /^\d+$/.test(value) ? Number(value) : null;
};

/**
 * The lines a stocktake sends: only what differs from the record. A count
 * left blank was not counted, so it changes nothing; a reorder level cleared
 * stops reordering the item by level.
 */
export function changedLines(
  items: readonly InventoryItem[],
  rows: Readonly<Record<string, CountRow | undefined>>,
): InventoryCountLine[] {
  const lines: InventoryCountLine[] = [];
  for (const item of items) {
    const row = rows[item.id];
    if (!row) continue;
    const line: InventoryCountLine = { id: item.id };
    const counted = whole(row.counted);
    if (counted !== null && counted !== item.quantity) line.quantity = counted;
    const min = row.min.trim() ? whole(row.min) : null;
    if (min !== item.minQuantity && (min !== null || !row.min.trim())) {
      line.minQuantity = min;
    }
    if (line.quantity !== undefined || line.minQuantity !== undefined) lines.push(line);
  }
  return lines;
}

/**
 * How many to order of an item at or under its reorder level: enough to bring
 * it back to twice that level — one level's worth to use while the next order
 * is on its way — and never less than one.
 */
export function suggestedOrder(item: Pick<InventoryItem, 'quantity' | 'minQuantity'>): number {
  return Math.max((item.minQuantity ?? 0) * 2 - item.quantity, 1);
}

/**
 * The last day an expiry as typed covers — the API's reading, kept here only
 * to warn before saving: `2028/07` (to the month's end), `07/2028`,
 * `2028/07/15`, a Jalali `1407/05`. `null` when it is not a date yet.
 */
export function expiryEnd(text: string): Date | null {
  const parts = toLatinDigits(text)
    .trim()
    .split(/[\s/\-.]+/)
    .filter(Boolean);
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  let year: number;
  let month: number | undefined;
  let day: number | undefined;
  if (parts[0].length === 4) [year, month, day] = nums;
  else if (parts.length > 1 && parts[parts.length - 1].length === 4) {
    year = nums[nums.length - 1];
    month = nums[nums.length - 2];
    day = nums.length === 3 ? nums[0] : undefined;
  } else return null;
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (year >= 1300 && year <= 1499) {
    const first = parseJalali(`${year}/${month ?? 1}/${day ?? 1}`, 'yyyy/M/d', new Date());
    if (!isValid(first)) return null;
    return day ? first : month ? endOfJalaliMonth(first) : endOfJalaliYear(first);
  }
  if (year < 1900 || year > 2199) return null;
  return day
    ? new Date(year, month! - 1, day)
    : month
      ? new Date(year, month, 0)
      : new Date(year, 11, 31);
}

/** An expiry already behind us — receiving stock like that is almost always a typo. */
export function isPast(text: string, now = new Date()): boolean {
  const end = expiryEnd(text);
  return end !== null && end < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
