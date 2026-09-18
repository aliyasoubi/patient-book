import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A structured follow-up on each surgery row: how many months after the
 * surgery, the resulting date, and when it was actually done. The free-text
 * `prosthesisDue` column stays for the imported rows that only ever had a
 * month name.
 */
export class SurgeryFollowUp1790400000000 implements MigrationInterface {
  name = 'SurgeryFollowUp1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue"
         ADD COLUMN "followUpMonths" smallint,
         ADD COLUMN "followUpDate" date,
         ADD COLUMN "followUpDoneAt" date`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_surgery_follow_up" ON "surgery_queue" ("followUpDate")
         WHERE "followUpDoneAt" IS NULL AND "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_surgery_follow_up"`);
    await queryRunner.query(
      `ALTER TABLE "surgery_queue"
         DROP COLUMN "followUpDoneAt",
         DROP COLUMN "followUpDate",
         DROP COLUMN "followUpMonths"`,
    );
  }
}
