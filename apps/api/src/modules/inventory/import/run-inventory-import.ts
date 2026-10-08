import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, resolve } from 'node:path';

import dataSource from '../../../database/data-source';
import { AuditLog } from '../../../infrastructure/persistence/entities/audit-log.entity';
import { InventoryMovementKind } from '../../../domain';
import { InventoryItem } from '../inventory-item.entity';
import { InventoryMovement } from '../inventory-movement.entity';
import { identityKey, itemSearchText } from '../inventory-stock';
import { readInventoryWorkbook } from './exceljs-inventory.reader';
import {
  ImportNote,
  mapInventoryWorkbook,
  WorkbookImport,
} from './inventory-workbook.mapper';

/**
 * Load the practice's stock workbook into an empty inventory, once.
 *
 *   npm run import:inventory -- path/to/workbook.xlsx            # preview only
 *   npm run import:inventory -- path/to/workbook.xlsx --apply    # write it
 *
 * The preview reads the workbook without touching the database and prints
 * every item it found and everything it had to interpret. `--apply` writes
 * them in one transaction, each with an opening count on its stock card that
 * names the cell it came from, and refuses an inventory that already holds
 * items: after the first run the app is where stock is kept, and a second
 * load would double it.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileArg = args.find((a) => !a.startsWith('--'));
  if (!fileArg) {
    console.error(
      'usage: npm run import:inventory -- <workbook.xlsx> [--apply]',
    );
    process.exit(2);
  }
  const filePath = resolve(process.cwd(), fileArg);
  if (!existsSync(filePath)) {
    console.error(`✗  Workbook not found: ${filePath}`);
    process.exit(1);
  }

  const result = mapInventoryWorkbook(await readInventoryWorkbook(filePath));
  printReport(result);

  if (result.notes.some((n) => n.level === 'error')) {
    console.error('\n✗  Nothing written: fix the errors above first.');
    process.exit(1);
  }
  if (!apply) {
    console.log(
      `\nPreview only. Re-run with --apply to write these ${result.items.length} items.`,
    );
    return;
  }

  await dataSource.initialize();
  try {
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM inventory_items',
    );
    if (Number(count) > 0) {
      console.error(
        `✗  The inventory already holds ${count} items. This import is for the ` +
          `first load only; after it, stock is kept in the app.`,
      );
      process.exit(1);
    }

    const actor = `cli:${userInfo().username}`;
    const workbook = basename(filePath);
    await dataSource.transaction(async (manager) => {
      const items = manager.getRepository(InventoryItem);
      const movements = manager.getRepository(InventoryMovement);
      for (const row of result.items) {
        const item = items.create({
          category: row.category,
          name: row.name,
          brand: row.brand,
          spec: row.spec,
          unit: row.unit,
          quantity: row.quantity,
          minQuantity: null,
          expiresOn: row.expiry?.date ?? null,
          expiryText: row.expiry?.text ?? null,
          notes: row.notes,
        });
        item.identityKey = identityKey(item);
        item.searchText = itemSearchText(item);
        const saved = await items.save(item);
        // Every item's card opens with the count the workbook recorded.
        await movements.save(
          movements.create({
            itemId: saved.id,
            kind: InventoryMovementKind.Count,
            change: row.quantity,
            quantityAfter: row.quantity,
            expiryText: row.expiry?.text ?? null,
            // `انبار C36`, not `انبار!C36`: a `!` between Persian and Latin
            // turns the reference round in a right-to-left line.
            note: `${workbook} · ${row.source.replace('!', ' ')}`,
            userId: null,
            username: actor,
          }),
        );
      }
      await manager.getRepository(AuditLog).save({
        userId: null,
        username: actor,
        action: 'create',
        entity: 'inventory_item',
        changes: { import: { workbook: filePath, items: result.items.length } },
      });
    });
    console.log(`\n✓  Imported ${result.items.length} items from ${workbook}.`);
  } finally {
    await dataSource.destroy();
  }
}

function printReport({ items, notes }: WorkbookImport): void {
  const byCategory = new Map<string, number>();
  for (const item of items) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
  }
  console.log(`${items.length} items`);
  for (const [category, n] of byCategory) {
    console.log(`  ${category.padEnd(12)} ${n}`);
  }

  const section = (level: ImportNote['level'], title: string) => {
    const rows = notes.filter((n) => n.level === level);
    if (!rows.length) return;
    console.log(`\n${title} (${rows.length})`);
    for (const n of rows) console.log(`  ${n.source.padEnd(16)} ${n.message}`);
  };
  section('error', 'Errors');
  section('review', 'To check on the shelf');
  section('info', 'For the record');
}

main().catch((error: unknown) => {
  console.error('✗  Inventory import failed:', error);
  process.exit(1);
});
