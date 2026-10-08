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
