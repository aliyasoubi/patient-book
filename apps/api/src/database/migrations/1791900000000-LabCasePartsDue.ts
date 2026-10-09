import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The day the lab promised the implant parts it did not send back with the
 * work. A case whose work is at the clinic but whose parts are still owed
 * carries it, so the parts can be chased on their own clock, apart from the
 * work's trips.
 */
export class LabCasePartsDue1791900000000 implements MigrationInterface {
  name = 'LabCasePartsDue1791900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "lab_cases" ADD COLUMN "partsDueAt" date`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "lab_cases" DROP COLUMN "partsDueAt"`);
  }
}
