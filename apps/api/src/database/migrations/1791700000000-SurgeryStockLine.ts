import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An implant placed out of the stock writes its surgery row itself: the row
 * keeps the stock card line it came from, so taking that use back takes the
 * row with it, and the row can say which box went in.
 */
export class SurgeryStockLine1791700000000 implements MigrationInterface {
  name = 'SurgeryStockLine1791700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "surgery_queue"
        ADD COLUMN "inventoryMovementId" uuid
          REFERENCES "inventory_movements"("id") ON DELETE SET NULL`);
    await q.query(
      `CREATE INDEX "idx_surgery_queue_inventory_movement" ON "surgery_queue" ("inventoryMovementId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "surgery_queue" DROP COLUMN "inventoryMovementId"`,
    );
  }
}
