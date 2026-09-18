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
 * were not in fact done. The note itself is left in place until the legacy
 * wrapper is deleted (see legacy-prosthesis-due.ts).
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
    // Only what this migration wrote: rows that still carry the note it read.
    await queryRunner.query(
      `UPDATE surgery_queue
          SET "followUpMonths" = NULL, "followUpDate" = NULL, "followUpDoneAt" = NULL
        WHERE "prosthesisDue" IS NOT NULL`,
    );
  }
}
