import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, extname, resolve } from 'node:path';

import dataSource from '../../../database/data-source';
import { AuditLog } from '../../../infrastructure/persistence/entities/audit-log.entity';
import { InventoryMovementKind } from '../../../domain';
import { InventoryItem } from '../inventory-item.entity';
import { writeMovement } from '../inventory-ledger';
import { identityKey, itemSearchText, receive } from '../inventory-stock';
import { readInventoryWorkbook } from './exceljs-inventory.reader';
import {
  ImportNote,
  mapInventoryWorkbook,
  WorkbookImport,
} from './inventory-workbook.mapper';

/**
 * Load the practice's stock workbook into the inventory.
 *
 *   npm run import:inventory -- path/to/workbook.xlsx                      # preview only
 *   npm run import:inventory -- path/to/workbook.xlsx --apply              # write it
 *   npm run import:inventory -- path/to/workbook.xlsx --replace            # preview, and what it replaces
 *   npm run import:inventory -- path/to/workbook.xlsx --replace --apply    # replace the inventory with it
 *
 * The preview reads the workbook and prints every item it found and
 * everything it had to interpret. `--apply` writes them in one transaction,
 * each with its stock as one batch and an opening count on its stock card
 * that names the cell it came from. It refuses an inventory that already
 * holds items — a second load would double it — unless `--replace` says the
 * workbook is the new source of truth: then the items, their batches and
 * their stock cards are deleted and the workbook loaded in that same
 * transaction, so the inventory is never half one and half the other.
 * Surgery rows written from a use keep their place in the implant file; only
 * their link to the deleted stock card line is cleared.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const replace = args.includes('--replace');
  const fileArg = args.find((a) => !a.startsWith('--'));
  if (!fileArg) {
    console.error(
      'usage: npm run import:inventory -- <workbook.xlsx> [--replace] [--apply]',
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
  if (!apply && !replace) {
    console.log(
      `\nPreview only. Re-run with --apply to write these ${result.items.length} items.`,
    );
    return;
  }

  await dataSource.initialize();
  try {
    const held = await current();
    if (replace) {
      console.log(
        `\nReplaces the current inventory: ${held.items} items, ${held.lines} stock card lines ` +
          `(${held.appLines} of them recorded in the app since loading), ` +
          `${held.surgeryRows} surgery rows linked to a use (kept, unlinked).`,
      );
      if (!apply) {
        console.log(
          `\nPreview only. Re-run with --replace --apply to replace it with these ${result.items.length} items.`,
        );
        return;
      }
    } else if (held.items > 0) {
      console.error(
        `✗  The inventory already holds ${held.items} items. A second load would ` +
          `double it; pass --replace to replace it with this workbook.`,
      );
      process.exit(1);
    }

    const actor = `cli:${userInfo().username}`;
    const workbook = basename(filePath);
    // The name without `.xlsx`: a Latin extension after a Persian name turns
    // round in a right-to-left line, and the stock card reads it there.
    const source = basename(filePath, extname(filePath));
    await dataSource.transaction(async (manager) => {
      if (replace) {
        await manager.query('DELETE FROM inventory_movements');
        await manager.query('DELETE FROM inventory_lots');
        await manager.query('DELETE FROM inventory_items');
      }
      const items = manager.getRepository(InventoryItem);
      for (const row of result.items) {
        const item = items.create({
          category: row.category,
          name: row.name,
          brand: row.brand,
          spec: row.spec,
          unit: row.unit,
          quantity: 0,
          minQuantity: null,
          expiresOn: null,
          expiryText: null,
          notes: row.notes,
        });
        item.identityKey = identityKey(item);
        item.searchText = itemSearchText(item);
        const saved = await items.save(item);
        // Every item's card opens with the count the workbook recorded, as
        // its first batch — the same line the app writes for an opening count.
        await writeMovement(
          manager,
          saved,
          InventoryMovementKind.Count,
          row.quantity
            ? [receive([], { quantity: row.quantity, expiry: row.expiry })]
            : [],
          {
            userId: null,
            username: actor,
            // `انبار C36`, not `انبار!C36`: a `!` between Persian and Latin
            // turns the reference round in a right-to-left line.
            note: `${source} · ${row.source.replace('!', ' ')}`,
          },
        );
      }
      await manager.getRepository(AuditLog).save({
        userId: null,
        username: actor,
        action: 'create',
        entity: 'inventory_item',
        changes: {
          import: { workbook: filePath, items: result.items.length },
          ...(replace ? { replaced: held } : {}),
        },
      });
    });
    console.log(
      `\n✓  ${replace ? 'Replaced the inventory with' : 'Imported'} ` +
        `${result.items.length} items from ${workbook}.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

/** What the inventory holds now, and what in it was recorded in the app. */
async function current(): Promise<{
  items: number;
  lines: number;
  appLines: number;
  surgeryRows: number;
}> {
  const [row] = await dataSource.query<
    Array<{
      items: number;
      lines: number;
      appLines: number;
      surgeryRows: number;
    }>
  >(
    `SELECT (SELECT count(*) FROM inventory_items)::int AS items,
            (SELECT count(*) FROM inventory_movements)::int AS lines,
            (SELECT count(*) FROM inventory_movements
              WHERE username IS NULL OR username NOT LIKE 'cli:%')::int AS "appLines",
            (SELECT count(*) FROM surgery_queue
              WHERE "inventoryMovementId" IS NOT NULL)::int AS "surgeryRows"`,
  );
  return row;
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
  section('renamed', 'Standardized names (as read  →  as stored)');
  section('info', 'For the record');
}

main().catch((error: unknown) => {
  console.error('✗  Inventory import failed:', error);
  process.exit(1);
});
