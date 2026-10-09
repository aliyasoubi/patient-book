import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock by batch: each item's balance becomes the sum of its batches — lot
 * number, expiry and how many are left — and each stock-card line names the
 * batch it moved and, for a use, the patient it went into, and is numbered in
 * the order it was written.
 *
 * What is on the shelf today moves into one batch per item, carrying the
 * item's expiry, so every balance and every warning reads exactly as before.
 * Earlier stock-card lines keep no batch: they were written before there was
 * one to name.
 */
export class InventoryLots1791600000000 implements MigrationInterface {
  name = 'InventoryLots1791600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "inventory_lots" (
        "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "itemId"      uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,
        "lotNumber"   varchar(60),
        "expiresOn"   date,
        "expiryText"  varchar(20),
        "quantity"    integer NOT NULL DEFAULT 0 CHECK ("quantity" >= 0),
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX "idx_inventory_lots_item" ON "inventory_lots" ("itemId")`,
    );
    // One row per batch: a second delivery of the same lot and expiry joins it.
    await q.query(
      `CREATE UNIQUE INDEX "idx_inventory_lots_identity" ON "inventory_lots"
         ("itemId", coalesce("lotNumber", ''), coalesce("expiryText", ''))`,
    );
    await q.query(`
      INSERT INTO "inventory_lots" ("itemId", "expiresOn", "expiryText", "quantity")
      SELECT "id", "expiresOn", "expiryText", "quantity"
        FROM "inventory_items"
       WHERE "quantity" > 0`);

    // `seq` orders the card: one movement can write several lines in a
    // transaction, and those share their `createdAt` to the microsecond.
    await q.query(`
      ALTER TABLE "inventory_movements"
        ADD COLUMN "lotId" uuid REFERENCES "inventory_lots"("id") ON DELETE SET NULL,
        ADD COLUMN "patientId" uuid REFERENCES "patients"("id") ON DELETE SET NULL,
        ADD COLUMN "seq" bigserial`);
    await q.query(
      `CREATE INDEX "idx_inventory_movements_lot" ON "inventory_movements" ("lotId")`,
    );
    await q.query(
      `CREATE INDEX "idx_inventory_movements_patient" ON "inventory_movements" ("patientId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "inventory_movements"
        DROP COLUMN "seq",
        DROP COLUMN "patientId",
        DROP COLUMN "lotId"`);
    await q.query(`DROP TABLE "inventory_lots"`);
  }
}
