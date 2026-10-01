import { MigrationInterface, QueryRunner } from 'typeorm';

import { JalaliDate } from '../../domain';

/**
 * The earliest due date reopened: 90 days before 2026-10-01, when the 16 rows
 * this reopens were counted and the choice was made. Fixed rather than counted
 * back from whenever this runs, so a later deploy reopens what was agreed —
 * not a smaller window that leaves the oldest of them closed.
 */
const REOPEN_FROM = '2026-07-03';

/** Marks this migration's audit lines, so `down()` reverses exactly those rows. */
const REASON = 'ReopenRecentBackfilledFollowUps1790900000000';

/**
 * Reopen the recent follow-ups that {@link BackfillSurgeryFollowUps1790700000000}
 * recorded as done.
 *
 * The backfill closed every legacy follow-up whose date had passed, on that
 * date, with no evidence the patient came in. For old ones that was a fair
 * trade against a page of stale red rows. For recent ones it hides a patient
 * who may still be owed their prosthesis: nothing lists a "done" row as
 * overdue. These go back to open, so they reach the overdue list and staff
 * flip the switch on the ones that did happen.
 *
 * A row is only reopened when everything about it says the backfill wrote it
 * and nobody has touched it since: an imported prosthesis note, closed on
 * exactly its due date, and no staff audit line on its completion (lines
 * with no user are migrations, this one included). Each one
 * reopened gets an audit line of its own.
 */
export class ReopenRecentBackfilledFollowUps1790900000000 implements MigrationInterface {
  name = 'ReopenRecentBackfilledFollowUps1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const today = JalaliDate.today().toIsoDate();
    const rows = (await queryRunner.query(
      `SELECT s.id, s."followUpDoneAt"::text AS "followUpDoneAt"
         FROM surgery_queue s
        WHERE s."deletedAt" IS NULL
          AND s.status <> 'cancelled'
          AND s."prosthesisDue" IS NOT NULL
          AND s."followUpDoneAt" IS NOT NULL
          AND s."followUpDoneAt" = s."followUpDate"
          AND s."followUpDate" < $1::date
          AND s."followUpDate" >= $2::date
          AND NOT EXISTS (
            SELECT 1 FROM audit_logs a
             WHERE a.entity = 'surgery_queue'
               AND a."entityId" = s.id::text
               AND a."userId" IS NOT NULL
               AND a.changes ? 'followUpDoneAt'
          )`,
      [today, REOPEN_FROM],
    )) as Array<{ id: string; followUpDoneAt: string }>;

    for (const row of rows) {
      await queryRunner.query(
        `UPDATE surgery_queue SET "followUpDoneAt" = NULL WHERE id = $1`,
        [row.id],
      );
      await queryRunner.query(
        `INSERT INTO audit_logs ("userId", action, entity, "entityId", changes)
         VALUES (NULL, 'update', 'surgery_queue', $1, $2::jsonb)`,
        [
          row.id,
          JSON.stringify({
            followUpDoneAt: null,
            previousFollowUpDoneAt: row.followUpDoneAt,
            reason: REASON,
          }),
        ],
      );
    }
    console.log(
      `✓  Reopened ${rows.length} backfilled follow-ups due since ${REOPEN_FROM}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Close again only what this migration opened and nobody has touched
    // since: a follow-up staff have marked done — or done and reopened —
    // keeps their decision, and one they moved no longer matches its date.
    const rows = (await queryRunner.query(
      `SELECT s.id, a.changes->>'previousFollowUpDoneAt' AS "previous"
         FROM audit_logs a
         JOIN surgery_queue s ON s.id::text = a."entityId"
        WHERE a.entity = 'surgery_queue'
          AND a.changes->>'reason' = $1
          AND s."followUpDoneAt" IS NULL
          AND s."followUpDate"::text = a.changes->>'previousFollowUpDoneAt'
          AND NOT EXISTS (
            SELECT 1 FROM audit_logs later
             WHERE later.entity = 'surgery_queue'
               AND later."entityId" = a."entityId"
               AND later."userId" IS NOT NULL
               AND later."createdAt" > a."createdAt"
               AND later.changes ? 'followUpDoneAt'
          )`,
      [REASON],
    )) as Array<{ id: string; previous: string }>;

    for (const row of rows) {
      await queryRunner.query(
        `UPDATE surgery_queue SET "followUpDoneAt" = $2::date WHERE id = $1`,
        [row.id, row.previous],
      );
      await queryRunner.query(
        `INSERT INTO audit_logs ("userId", action, entity, "entityId", changes)
         VALUES (NULL, 'update', 'surgery_queue', $1, $2::jsonb)`,
        [
          row.id,
          JSON.stringify({
            followUpDoneAt: row.previous,
            reason: `revert ${REASON}`,
          }),
        ],
      );
    }
  }
}
