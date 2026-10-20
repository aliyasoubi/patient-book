import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The work each tooth of a lab case gets, so one case can carry a jaw's
 * crowns, laminates and implant crowns together — one prescription, one trip,
 * one fitting — instead of one case per kind of work.
 *
 * Every case picked on the chart so far has exactly one kind of work, which
 * the API has held since the chart arrived, so each of its teeth gets that
 * work and nothing is guessed. A charted case holding several kinds could only
 * have been written past the form; which tooth had which is not on record, so
 * its teeth go back into the written tooth text, as the cases before the chart
 * keep theirs, for staff to read and pick again.
 */
export class LabCaseToothWork1792400000000 implements MigrationInterface {
  name = 'LabCaseToothWork1792400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "lab_case_teeth" (
        "labCaseId"  uuid NOT NULL REFERENCES "lab_cases"("id") ON DELETE CASCADE,
        "tooth"      smallint NOT NULL,
        "workType"   "lab_cases_worktypes_enum" NOT NULL,
        CONSTRAINT "pk_lab_case_teeth" PRIMARY KEY ("labCaseId", "tooth"),
        CONSTRAINT "chk_lab_case_teeth_per_tooth"
          CHECK ("workType" NOT IN ('night_guard', 'sx'))
      )`);

    await q.query(`
      INSERT INTO "lab_case_teeth" ("labCaseId", "tooth", "workType")
      SELECT c."id", t."tooth", c."workTypes"[1]
        FROM "lab_cases" c
        CROSS JOIN LATERAL unnest(c."teethFdi") AS t("tooth")
       WHERE cardinality(c."workTypes") = 1
         AND c."workTypes"[1] NOT IN ('night_guard', 'sx')`);

    await q.query(`
      UPDATE "lab_cases"
         SET "teeth" = array_to_string("teethFdi", ' '),
             "toothCount" = cardinality("teethFdi"),
             "teethFdi" = '{}'
       WHERE cardinality("teethFdi") > 0
         AND NOT EXISTS (
           SELECT 1 FROM "lab_case_teeth" w WHERE w."labCaseId" = "lab_cases"."id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // `teethFdi` and `workTypes` still hold every tooth and every kind of
    // work; which tooth had which goes with the table.
    await q.query(`DROP TABLE "lab_case_teeth"`);
  }
}
