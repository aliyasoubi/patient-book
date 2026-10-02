import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which jaw a night guard is for. It is made per jaw, not per tooth, so it
 * gets this instead of a tooth count and numbers.
 *
 * Night guards already on the board wrote the jaw into the tooth text —
 * «فک بالا», «فک پایین» — so those move over; a tooth text that names no jaw
 * is left as it is for staff to read and pick.
 */
export class LabCaseJaw1791300000000 implements MigrationInterface {
  name = 'LabCaseJaw1791300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "lab_cases_jaw_enum" AS ENUM ('upper', 'lower', 'both')`,
    );
    await q.query(
      `ALTER TABLE "lab_cases" ADD COLUMN "jaw" "lab_cases_jaw_enum"`,
    );
    // Both jaws first: «دو فک» / «هر دو فک» / «بالا و پایین» must not read as one.
    for (const [jaw, pattern] of [
      ['both', '(دو فک|هر دو|بالا و پایین|بالا و پائین)'],
      ['upper', '(فک بالا|^بالا$)'],
      ['lower', '(فک پایین|فک پائین|^پایین$|^پائین$)'],
    ] as const) {
      await q.query(
        `UPDATE "lab_cases"
            SET "jaw" = $1, "teeth" = '', "toothCount" = NULL
          WHERE "workTypes" = ARRAY['night_guard']::"lab_cases_worktypes_enum"[]
            AND "jaw" IS NULL
            AND trim("teeth") ~ $2`,
        [jaw, pattern],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // The jaw goes back into the tooth text it came from.
    await q.query(
      `UPDATE "lab_cases"
          SET "teeth" = CASE "jaw" WHEN 'upper' THEN 'فک بالا'
                                   WHEN 'lower' THEN 'فک پایین'
                                   ELSE 'هر دو فک' END
        WHERE "jaw" IS NOT NULL AND "teeth" = ''`,
    );
    await q.query(`ALTER TABLE "lab_cases" DROP COLUMN "jaw"`);
    await q.query(`DROP TYPE "lab_cases_jaw_enum"`);
  }
}
