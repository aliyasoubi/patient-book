import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tell a follow-up staff recorded as done apart from one the backfill
 * closed on its own (see BackfillSurgeryFollowUps): that migration assumed
 * every past-due follow-up from the paper diary had happened, and stamped it
 * done on its due date. Those rows are flagged here so the list can show
 * them as unconfirmed until someone confirms or reopens each one.
 *
 * The backfill's mark is `followUpDoneAt = followUpDate` on a row that still
 * carries the paper note. Staff switching one on write today's date instead,
 * so a row matches only if nobody has touched its completion since — or
 * someone happened to close it on its exact due date, which merely asks them
 * to confirm it once more.
 */
export class FollowUpDoneInferred1791000000000 implements MigrationInterface {
  name = 'FollowUpDoneInferred1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue"
         ADD COLUMN "followUpDoneInferred" boolean NOT NULL DEFAULT false`,
    );
    const [, flagged] = (await queryRunner.query(
      `UPDATE surgery_queue SET "followUpDoneInferred" = true
        WHERE "prosthesisDue" IS NOT NULL
          AND "followUpDoneAt" IS NOT NULL
          AND "followUpDoneAt" = "followUpDate"`,
    )) as [unknown, number];
    console.log(`✓  Flagged ${flagged} backfilled follow-ups as unconfirmed`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surgery_queue" DROP COLUMN "followUpDoneInferred"`,
    );
  }
}
