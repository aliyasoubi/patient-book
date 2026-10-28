import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A follow-up names its patient file directly. Until now it reached one only
 * through an implant register entry, so an extraction or a graft — which has
 * none — had a name and nothing else: no file number, no phone to call.
 *
 * Rows already linked through their implant case take that case's patient,
 * but only where the two names agree: a register number reused for someone
 * else (`hasNameMismatch`) is left for staff to link by hand rather than
 * handed the number's current holder.
 */
export class SurgeryQueuePatient1792500000000 implements MigrationInterface {
  name = 'SurgeryQueuePatient1792500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "surgery_queue" ADD COLUMN "patientId" uuid REFERENCES "patients"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE INDEX "idx_surgery_queue_patient" ON "surgery_queue" ("patientId")`,
    );
    await q.query(
      `UPDATE "surgery_queue" s
          SET "patientId" = c."patientId"
         FROM "implant_cases" c
        WHERE s."implantCaseId" = c."id"
          AND c."patientId" IS NOT NULL
          AND s."hasNameMismatch" = false`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_surgery_queue_patient"`);
    await q.query(`ALTER TABLE "surgery_queue" DROP COLUMN "patientId"`);
  }
}
