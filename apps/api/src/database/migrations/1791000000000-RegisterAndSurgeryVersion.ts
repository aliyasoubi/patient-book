import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['surgery_queue', 'implant_cases', 'ortho_cases'] as const;

/**
 * Optimistic-concurrency version for surgery rows and register cases, as
 * patients already have (PatientVersion1789200000000): an edit made from a
 * form loaded before someone else saved is refused, not silently applied.
 */
export class RegisterAndSurgeryVersion1791000000000 implements MigrationInterface {
  name = 'RegisterAndSurgeryVersion1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "version" integer NOT NULL DEFAULT 1`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "version"`);
    }
  }
}
