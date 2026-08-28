import { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve registry and surgery records when staff remove them from active work. */
export class ArchiveClinicalRegisters1787830100000 implements MigrationInterface {
  name = 'ArchiveClinicalRegisters1787830100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "implant_cases" ADD COLUMN "deletedAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "ortho_cases" ADD COLUMN "deletedAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "surgery_queue" ADD COLUMN "deletedAt" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue" DROP COLUMN "deletedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ortho_cases" DROP COLUMN "deletedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "implant_cases" DROP COLUMN "deletedAt"`,
    );
  }
}
