import { MigrationInterface, QueryRunner } from 'typeorm';

/** Optimistic-concurrency version for patient records; see Patient.version. */
export class PatientVersion1789200000000 implements MigrationInterface {
  name = 'PatientVersion1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "patients" ADD COLUMN "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "version"`);
  }
}
