import { MigrationInterface, QueryRunner } from 'typeorm';

/** A surgery row is written after the fact; see SurgeryQueueItem.status. */
export class SurgeryDefaultCompleted1790500000000 implements MigrationInterface {
  name = 'SurgeryDefaultCompleted1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue" ALTER COLUMN "status" SET DEFAULT 'completed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue" ALTER COLUMN "status" SET DEFAULT 'scheduled'`,
    );
  }
}
