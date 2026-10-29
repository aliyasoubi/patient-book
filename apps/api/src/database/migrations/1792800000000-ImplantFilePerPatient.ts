import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A patient has one implant file, and now the database holds it too: no two
 * files that are not archived name the same patient. The API already refuses
 * a second (`ERR_IMPLANT_CASE_EXISTS`); this keeps anything that bypasses it
 * from writing one.
 *
 * Files linked twice before the rule have to be settled first, or the index
 * cannot be built: `ops/deploy/implant-cleanup.sh --apply` leaves each
 * patient one. This refuses with that said rather than with Postgres's
 * duplicate-key error.
 */
export class ImplantFilePerPatient1792800000000 implements MigrationInterface {
  name = 'ImplantFilePerPatient1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    const [shared] = (await q.query(
      `SELECT count(*)::int AS n FROM (
         SELECT "patientId" FROM "implant_cases"
          WHERE "patientId" IS NOT NULL AND "deletedAt" IS NULL
          GROUP BY "patientId" HAVING count(*) > 1) AS twice`,
    )) as Array<{ n: number }>;
    if (shared.n > 0) {
      throw new Error(
        `${shared.n} patient(s) are linked to more than one implant file. ` +
          'Run ./ops/deploy/implant-cleanup.sh --apply, then deploy again.',
      );
    }
    await q.query(
      `CREATE UNIQUE INDEX "idx_implant_one_per_patient" ON "implant_cases" ("patientId")
        WHERE "patientId" IS NOT NULL AND "deletedAt" IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_implant_one_per_patient"`);
  }
}
