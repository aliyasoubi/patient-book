import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The follow-up a surgery row owes the patient stops being a yes/no switch
 * ("it happened") and becomes where it stands with them: still to be called
 * (`open`), booked (with the day, when it was written down) or cancelled by
 * the patient. Rows that had been marked done are booked — the patient had
 * come, so the day it happened stands as their appointment.
 *
 * Also the teeth, picked on the chart as FDI numbers (older rows keep their
 * written phrase), and three more kinds of surgery that owe a follow-up.
 */
export class SurgeryFollowUpStatus1792100000000 implements MigrationInterface {
  name = 'SurgeryFollowUpStatus1792100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "surgery_queue_kind_enum" ADD VALUE IF NOT EXISTS 'bone_graft'`,
    );
    await q.query(
      `ALTER TYPE "surgery_queue_kind_enum" ADD VALUE IF NOT EXISTS 'sinus_lift'`,
    );
    await q.query(
      `ALTER TYPE "surgery_queue_kind_enum" ADD VALUE IF NOT EXISTS 'prosthesis'`,
    );
    // The declaration order is the sort order: the list puts `open` first.
    await q.query(
      `CREATE TYPE "surgery_queue_follow_up_status_enum" AS ENUM ('open', 'booked', 'declined')`,
    );
    await q.query(
      `ALTER TABLE "surgery_queue"
         ADD COLUMN "followUpStatus" "surgery_queue_follow_up_status_enum" NOT NULL DEFAULT 'open',
         ADD COLUMN "followUpAppointmentAt" date,
         ADD COLUMN "teethFdi" smallint[] NOT NULL DEFAULT '{}'`,
    );
    await q.query(
      `UPDATE "surgery_queue"
          SET "followUpStatus" = 'booked', "followUpAppointmentAt" = "followUpDoneAt"
        WHERE "followUpDoneAt" IS NOT NULL`,
    );
    // The partial index is over the column being dropped.
    await q.query(`DROP INDEX "idx_surgery_follow_up"`);
    await q.query(`ALTER TABLE "surgery_queue" DROP COLUMN "followUpDoneAt"`);
    await q.query(
      `CREATE INDEX "idx_surgery_follow_up" ON "surgery_queue" ("followUpDate")
         WHERE "followUpStatus" = 'open' AND "deletedAt" IS NULL`,
    );
  }

  /**
   * Cancelled-by-patient rows have no "done" to go back to; they are left
   * closed, dated today. The three kinds stay in the enum — a value cannot be
   * dropped from one — and are harmless unused.
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_surgery_follow_up"`);
    await q.query(
      `ALTER TABLE "surgery_queue" ADD COLUMN "followUpDoneAt" date`,
    );
    await q.query(
      `UPDATE "surgery_queue"
          SET "followUpDoneAt" = COALESCE("followUpAppointmentAt", CURRENT_DATE)
        WHERE "followUpStatus" <> 'open'`,
    );
    await q.query(
      `CREATE INDEX "idx_surgery_follow_up" ON "surgery_queue" ("followUpDate")
         WHERE "followUpDoneAt" IS NULL AND "deletedAt" IS NULL`,
    );
    await q.query(
      `ALTER TABLE "surgery_queue"
         DROP COLUMN "teethFdi",
         DROP COLUMN "followUpAppointmentAt",
         DROP COLUMN "followUpStatus"`,
    );
    await q.query(`DROP TYPE "surgery_queue_follow_up_status_enum"`);
  }
}
