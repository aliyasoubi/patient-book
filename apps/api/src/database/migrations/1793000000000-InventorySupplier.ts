import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who a delivery came from. One product can come from several suppliers at
 * several prices, so it is kept on each delivery's stock card line, with what
 * the delivery cost in the line's `unitPrice`, and not on the item.
 */
export class InventorySupplier1793000000000 implements MigrationInterface {
  name = 'InventorySupplier1793000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "inventory_movements" ADD COLUMN "supplier" varchar(120)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "inventory_movements" DROP COLUMN "supplier"`);
  }
}
