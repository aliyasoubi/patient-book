import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Implant placement or extraction. Every existing row quotes an implant
 * register number, so the history is all implants.
 */
export class SurgeryKind1790600000000 implements MigrationInterface {
  name = 'SurgeryKind1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "surgery_queue_kind_enum" AS ENUM ('implant', 'extraction')`,
    );
    await queryRunner.query(
      `ALTER TABLE "surgery_queue"
         ADD COLUMN "kind" "surgery_queue_kind_enum" NOT NULL DEFAULT 'implant'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "surgery_queue" DROP COLUMN "kind"`);
    await queryRunner.query(`DROP TYPE "surgery_queue_kind_enum"`);
  }
}
