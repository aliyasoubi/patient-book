import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What an item sold to patients goes for, in rials, and what each sale went
 * for: the item's price is where a sale starts from, and the line keeps the
 * price of the day.
 */
export class InventorySalePrice1792900000000 implements MigrationInterface {
  name = 'InventorySalePrice1792900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "inventory_items" ADD COLUMN "salePrice" int`);
    await q.query(
      `ALTER TABLE "inventory_movements" ADD COLUMN "unitPrice" int`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "inventory_movements" DROP COLUMN "unitPrice"`);
    await q.query(`ALTER TABLE "inventory_items" DROP COLUMN "salePrice"`);
  }
}
