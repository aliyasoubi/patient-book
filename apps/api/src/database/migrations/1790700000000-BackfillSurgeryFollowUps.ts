import { addMonths } from 'date-fns-jalali';
import { MigrationInterface, QueryRunner } from 'typeorm';

import { legacyFollowUpMonths } from '../../modules/surgery/legacy-prosthesis-due';
import { JalaliDate } from '../../domain';

/**
 * Turn the imported "تاریخ پروتز" month names into structured follow-ups —
 * months after the surgery, and the date that resolves to — so every row
 * shows and filters the same way.
 *
 * A follow-up whose month had already passed when this ran is recorded as
 * done on its due date: the practice handled those on paper before the app
 * tracked them, and a page of red "missed" rows from last year would only
 * teach staff to ignore the tile. The switch on the card reopens any that
 * were not in fact done. Those due in the 90 days before the fix were
 * reopened wholesale by ReopenRecentBackfilledFollowUps1790900000000.
 *
 * The note itself is left in place until the runtime fallbacks are removed;
 * see legacy-prosthesis-due.ts, whose parser this migration depends on.
 */
export class BackfillSurgeryFollowUps1790700000000 implements MigrationInterface {
  name = 'BackfillSurgeryFollowUps1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT id, "prosthesisDue", "surgeryDate" FROM surgery_queue
        WHERE "prosthesisDue" IS NOT NULL AND "followUpDate" IS NULL AND "surgeryDate" IS NOT NULL`,
    )) as Array<{
      id: string;
      prosthesisDue: string;
      surgeryDate: Date | string;
    }>;
    const today = JalaliDate.today().toIsoDate();
    let patched = 0;

    for (const row of rows) {
      const surgeryDate = new Date(row.surgeryDate);
      const months = legacyFollowUpMonths(row.prosthesisDue, surgeryDate);
      if (months === null) continue;
      const due = JalaliDate.fromDate(
        addMonths(surgeryDate, months),
      )!.toIsoDate();
      await queryRunner.query(
        `UPDATE surgery_queue
            SET "followUpMonths" = $2, "followUpDate" = $3::date, "followUpDoneAt" = $4::date
          WHERE id = $1`,
        // Closed on its due date when that date is already behind us.
        [row.id, months, due, due < today ? due : null],
      );
      patched++;
    }
    console.log(
      `✓  Backfilled ${patched} of ${rows.length} legacy prosthesis follow-ups`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only what this migration wrote and nobody has touched since: the
    // months and date still derive from the note it read, and the row is
    // either open or closed on its due date. A follow-up staff have moved,
    // reopened or completed on another day keeps their edit. An open row
    // alone cannot tell "never closed" from "closed, then reopened by staff",
    // so a staff audit line on its completion rules it out too; lines with no
    // user are other migrations, which revert before this one does.
    const rows = (await queryRunner.query(
      `SELECT s.id, s."prosthesisDue", s."surgeryDate", s."followUpMonths",
              s."followUpDate"::text AS "followUpDate",
              s."followUpDoneAt"::text AS "followUpDoneAt"
         FROM surgery_queue s
        WHERE s."prosthesisDue" IS NOT NULL AND s."followUpDate" IS NOT NULL
          AND s."surgeryDate" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM audit_logs a
             WHERE a.entity = 'surgery_queue'
               AND a."entityId" = s.id::text
               AND a."userId" IS NOT NULL
               AND a.changes ? 'followUpDoneAt'
          )`,
    )) as Array<{
      id: string;
      prosthesisDue: string;
      surgeryDate: Date | string;
      followUpMonths: number | null;
      followUpDate: string;
      followUpDoneAt: string | null;
    }>;

    for (const row of rows) {
      const surgeryDate = new Date(row.surgeryDate);
      const months = legacyFollowUpMonths(row.prosthesisDue, surgeryDate);
      if (months === null || months !== row.followUpMonths) continue;
      const due = JalaliDate.fromDate(
        addMonths(surgeryDate, months),
      )!.toIsoDate();
      if (row.followUpDate !== due) continue;
      if (row.followUpDoneAt !== null && row.followUpDoneAt !== due) continue;
      await queryRunner.query(
        `UPDATE surgery_queue
            SET "followUpMonths" = NULL, "followUpDate" = NULL, "followUpDoneAt" = NULL
          WHERE id = $1`,
        [row.id],
      );
    }
  }
}
