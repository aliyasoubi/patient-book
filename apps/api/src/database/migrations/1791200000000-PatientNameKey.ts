import { MigrationInterface, QueryRunner } from 'typeorm';

import { searchKey } from '../../domain';

const BATCH = 1000;

/**
 * The folded full name search ranks on; see Patient.nameKey. Backfilled with
 * the same `searchKey` the entity uses, so existing rows rank exactly as rows
 * saved from now on — folding in SQL would be a second copy of the rule.
 */
export class PatientNameKey1791200000000 implements MigrationInterface {
  name = 'PatientNameKey1791200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "patients" ADD COLUMN "nameKey" text NOT NULL DEFAULT ''`,
    );

    const rows = (await q.query(
      `SELECT "id", "firstName", "lastName" FROM "patients"`,
    )) as Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await q.query(
        `UPDATE "patients" p SET "nameKey" = v.key
           FROM unnest($1::uuid[], $2::text[]) AS v(id, key)
          WHERE p.id = v.id`,
        [
          batch.map((r) => r.id),
          batch.map((r) =>
            searchKey(`${r.firstName ?? ''} ${r.lastName ?? ''}`),
          ),
        ],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "patients" DROP COLUMN "nameKey"`);
  }
}
