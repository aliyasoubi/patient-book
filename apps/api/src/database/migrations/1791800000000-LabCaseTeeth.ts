import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The teeth a lab case is for, picked from a chart and kept as FDI numbers
 * instead of typed text and a count.
 *
 * Cases already on the board keep their typed text and count untouched — free
 * text cannot be read back into tooth numbers reliably, and these are the
 * practice's real records — so the card shows them as written until someone
 * edits the case and picks the teeth.
 */
export class LabCaseTeeth1791800000000 implements MigrationInterface {
  name = 'LabCaseTeeth1791800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "lab_cases" ADD COLUMN "teethFdi" smallint[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "lab_cases" DROP COLUMN "teethFdi"`);
  }
}
