import { MigrationInterface, QueryRunner } from 'typeorm';

import { soldToPatientsByName } from '../../modules/inventory/inventory-catalog';

/**
 * Which items are sold to patients — a use of one asks who bought it. Set
 * for the stock already on the shelves by the same name rule the import
 * uses: every toothbrush, toothpastes, floss, water jets and home bleaching
 * kits, not what the hygienist uses in the chair. Staff switch it on the
 * item from then on.
 */
export class InventorySoldToPatients1792200000000 implements MigrationInterface {
  name = 'InventorySoldToPatients1792200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "inventory_items" ADD COLUMN "soldToPatients" boolean NOT NULL DEFAULT false`,
    );
    const rows = (await q.query(
      `SELECT "id", "name" FROM "inventory_items"`,
    )) as Array<{ id: string; name: string }>;
    const sold = rows.filter((r) => soldToPatientsByName(r.name));
    if (sold.length) {
      await q.query(
        `UPDATE "inventory_items" SET "soldToPatients" = true WHERE "id" = ANY($1)`,
        [sold.map((r) => r.id)],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "inventory_items" DROP COLUMN "soldToPatients"`);
  }
}
