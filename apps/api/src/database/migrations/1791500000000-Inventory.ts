import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The clinic's stock: one row per thing on the shelves, and its stock card —
 * every delivery, use, discard and count, with the balance each left.
 *
 * The balance lives on the item for listing and filtering, but only a
 * movement ever changes it, in the same transaction; the CHECK keeps it from
 * going below zero whatever path writes it.
 */
export class Inventory1791500000000 implements MigrationInterface {
  name = 'Inventory1791500000000';

  public async up(q: QueryRunner): Promise<void> {
    // Persian order, with digits read as numbers: sizes list 8, 10, 12 and
    // files 15, 20, 25 — not 10, 12, 8 as plain text sorts them.
    await q.query(
      `CREATE COLLATION IF NOT EXISTS "fa_natural" (provider = icu, locale = 'fa-u-kn')`,
    );
    await q.query(
      `CREATE TYPE "inventory_items_category_enum" AS ENUM
         ('implant','healing','abutment','graft','membrane','anesthesia','composite',
          'laminate','impression','endo','surgery','restorative','orthodontic',
          'consumable','hygiene','other')`,
    );
    await q.query(
      `CREATE TYPE "inventory_items_unit_enum" AS ENUM
         ('piece','pack','box','bottle','syringe','cartridge','tube','kit','roll')`,
    );
    await q.query(`
      CREATE TABLE "inventory_items" (
        "id"           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "category"     "inventory_items_category_enum" NOT NULL,
        "name"         varchar(120) NOT NULL,
        "brand"        varchar(80),
        "spec"         varchar(120),
        "unit"         "inventory_items_unit_enum" NOT NULL DEFAULT 'piece',
        "quantity"     integer NOT NULL DEFAULT 0 CHECK ("quantity" >= 0),
        "minQuantity"  integer CHECK ("minQuantity" >= 0),
        "expiresOn"    date,
        "expiryText"   varchar(20),
        "notes"        text,
        "identityKey"  varchar(400) NOT NULL,
        "searchText"   text NOT NULL DEFAULT '',
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz NOT NULL DEFAULT now(),
        "version"      integer NOT NULL DEFAULT 1,
        "deletedAt"    timestamptz
      )`);
    await q.query(
      `CREATE INDEX "idx_inventory_items_category" ON "inventory_items" ("category")`,
    );
    await q.query(
      `CREATE INDEX "idx_inventory_items_expires" ON "inventory_items" ("expiresOn")`,
    );
    // One active row per product; an archived one does not block re-adding it.
    await q.query(
      `CREATE UNIQUE INDEX "idx_inventory_items_identity" ON "inventory_items" ("identityKey")
         WHERE "deletedAt" IS NULL`,
    );
    await q.query(
      `CREATE INDEX "idx_inventory_items_search" ON "inventory_items" USING GIN ("searchText" gin_trgm_ops)`,
    );

    await q.query(
      `CREATE TYPE "inventory_movements_kind_enum" AS ENUM
         ('receive','use','discard','count')`,
    );
    await q.query(`
      CREATE TABLE "inventory_movements" (
        "id"             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "itemId"         uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,
        "kind"           "inventory_movements_kind_enum" NOT NULL,
        "change"         integer NOT NULL,
        "quantityAfter"  integer NOT NULL CHECK ("quantityAfter" >= 0),
        "expiryText"     varchar(20),
        "note"           varchar(300),
        "userId"         uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "username"       varchar(80),
        "createdAt"      timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX "idx_inventory_movements_item" ON "inventory_movements" ("itemId", "createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "inventory_movements"`);
    await q.query(`DROP TYPE "inventory_movements_kind_enum"`);
    await q.query(`DROP TABLE "inventory_items"`);
    await q.query(`DROP TYPE "inventory_items_unit_enum"`);
    await q.query(`DROP TYPE "inventory_items_category_enum"`);
    await q.query(`DROP COLLATION IF EXISTS "fa_natural"`);
  }
}
