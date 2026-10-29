import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An implant's use names the tooth it went into and the follow-up it is filed
 * under. The day's implants for a patient are one follow-up, so the row alone
 * cannot say which size went into which tooth, nor which of the day's uses an
 * undo is taking back; the stock card lines can, and the follow-up lists them.
 *
 * Nothing is filled in: a use from before wrote its box into the row's notes,
 * which stay as they are.
 */
export class InventoryMovementSurgery1792700000000 implements MigrationInterface {
  name = 'InventoryMovementSurgery1792700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "inventory_movements" ADD COLUMN "tooth" varchar(60)`,
    );
    await q.query(
      `ALTER TABLE "inventory_movements" ADD COLUMN "surgeryId" uuid REFERENCES "surgery_queue"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE INDEX "idx_inventory_movements_surgery" ON "inventory_movements" ("surgeryId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_inventory_movements_surgery"`);
    await q.query(`ALTER TABLE "inventory_movements" DROP COLUMN "surgeryId"`);
    await q.query(`ALTER TABLE "inventory_movements" DROP COLUMN "tooth"`);
  }
}
