import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A surgery can name its patient directly. Until now the only way to one
 * was through the implant register entry, so an extraction — which has no
 * register entry — could not name a patient at all.
 *
 * Nothing is copied from the register: a surgery without a link of its own
 * keeps following its register entry's, so correcting that link corrects
 * every surgery under it.
 */
export class SurgeryPatientLink1791100000000 implements MigrationInterface {
  name = 'SurgeryPatientLink1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue"
         ADD COLUMN "patientId" uuid REFERENCES "patients"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_surgery_queue_patient" ON "surgery_queue" ("patientId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_surgery_queue_patient"`);
    await queryRunner.query(
      `ALTER TABLE "surgery_queue" DROP COLUMN "patientId"`,
    );
  }
}
