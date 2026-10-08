import { EntityManager } from 'typeorm';

import { InventoryMovementKind } from '../../domain';
import { InventoryItem } from './inventory-item.entity';
import { InventoryLot } from './inventory-lot.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { LotChange, LotLevel, nearestExpiry } from './inventory-stock';

/** Who wrote a stock card line, and what else it records. */
export interface LineMeta {
  userId: string | null;
  /** The terminal import's `cli:<user>`; null for the app, which has `userId`. */
  username?: string | null;
  note?: string | null;
  patientId?: string | null;
}

/** An item's batches, oldest delivery first. */
export function loadLots(
  manager: EntityManager,
  itemId: string,
): Promise<InventoryLot[]> {
  return manager
    .getRepository(InventoryLot)
    .find({ where: { itemId }, order: { createdAt: 'ASC' } });
}

/**
 * Write what a movement does to a locked item: each batch's change, one stock
 * card line per batch with the balance it left, and the item's balance and
 * nearest expiry read back from its batches — the only place either is ever
 * written. A count that found the shelf as recorded still gets its line: that
 * it was checked is worth keeping.
 *
 * Shared by the API and the terminal import, so a loaded workbook's stock
 * cards read exactly like the app's.
 */
export async function writeMovement(
  manager: EntityManager,
  item: InventoryItem,
  kind: InventoryMovementKind,
  changes: LotChange<InventoryLot | LotLevel>[],
  meta: LineMeta,
): Promise<void> {
  const lots = manager.getRepository(InventoryLot);
  const movements = manager.getRepository(InventoryMovement);
  const line = (change: number, after: number, lot: InventoryLot | null) =>
    movements.create({
      itemId: item.id,
      kind,
      change,
      quantityAfter: after,
      lotId: lot?.id ?? null,
      expiryText: lot?.expiryText ?? null,
      patientId: meta.patientId ?? null,
      note: meta.note ?? null,
      userId: meta.userId,
      username: meta.username ?? null,
    });

  let balance = item.quantity;
  const lines: InventoryMovement[] = [];
  for (const { lot, change } of changes) {
    const saved = await lots.save(
      lots.create({
        ...(lot.id ? { id: lot.id, createdAt: lot.createdAt as Date } : {}),
        itemId: item.id,
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn as Date | null,
        expiryText: lot.expiryText,
        quantity: lot.quantity + change,
      }),
    );
    balance += change;
    lines.push(line(change, balance, saved));
  }
  if (!lines.length) lines.push(line(0, balance, null));
  await movements.save(lines);

  const after = await loadLots(manager, item.id);
  await manager.getRepository(InventoryItem).update(item.id, {
    quantity: after.reduce((n, l) => n + l.quantity, 0),
    ...nearestExpiry(after),
    version: () => '"version" + 1',
  });
}
