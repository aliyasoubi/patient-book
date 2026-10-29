import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The calls made about a follow-up — what each came to, who made it, when —
 * and the day the last one said to call again. Only adds: nothing existing
 * is rewritten, and a follow-up with no calls reads as before.
 */
export class FollowUpContacts1792600000000 implements MigrationInterface {
  name = 'FollowUpContacts1792600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "surgery_queue" ADD COLUMN "nextContactAt" date`,
    );
    await q.query(
      `CREATE INDEX "idx_surgery_queue_next_contact" ON "surgery_queue" ("nextContactAt")`,
    );
    await q.query(
      `CREATE TYPE "follow_up_contacts_outcome_enum" AS ENUM ('no_answer','call_later','booked','declined')`,
    );
    await q.query(`
      CREATE TABLE "follow_up_contacts" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "surgeryId"     uuid NOT NULL REFERENCES "surgery_queue"("id") ON DELETE CASCADE,
        "outcome"       "follow_up_contacts_outcome_enum" NOT NULL,
        "note"          varchar(300),
        "nextContactAt" date,
        "userId"        uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt"     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX "idx_follow_up_contacts_surgery" ON "follow_up_contacts" ("surgeryId", "createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "follow_up_contacts"`);
    await q.query(`DROP TYPE "follow_up_contacts_outcome_enum"`);
    await q.query(`DROP INDEX "idx_surgery_queue_next_contact"`);
    await q.query(`ALTER TABLE "surgery_queue" DROP COLUMN "nextContactAt"`);
  }
}
