import { MigrationInterface, QueryRunner } from 'typeorm';

const BACKUP = 'patients_data_issues_backup_1791400000000';

/**
 * A wrong check digit on a national id is an import flag. Matches both
 * shapes: current flags carry the code, flags saved before issues had codes
 * carry only the importer's Persian sentence.
 */
const IS_CHECKSUM_ISSUE = `(
  i->>'code' = 'ERR_NATIONAL_ID_CHECKSUM'
  OR (i->>'field' = 'nationalId' AND i->>'message' LIKE '%رقم کنترل%')
)`;

/**
 * National ids are now checked for length only (see NationalId), so a flag
 * saying one "fails its check digit" no longer describes a problem the app
 * recognises — about half the review list was nothing else. Drop those flags
 * and keep every other one.
 *
 * Each changed patient's issue list is copied to a backup table first, and
 * `down` puts it back verbatim, so this can be undone exactly. Undoing also
 * reverts any other review done on those patients since, which is why the
 * backup is per patient rather than per flag.
 */
export class DropNationalIdChecksumIssues1791400000000 implements MigrationInterface {
  name = 'DropNationalIdChecksumIssues1791400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "${BACKUP}" (
         "patientId"  uuid PRIMARY KEY,
         "dataIssues" jsonb NOT NULL,
         "backedUpAt" timestamptz NOT NULL DEFAULT now()
       )`,
    );
    await q.query(
      `INSERT INTO "${BACKUP}" ("patientId", "dataIssues")
       SELECT p.id, p."dataIssues" FROM "patients" p
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(p."dataIssues") i
           WHERE ${IS_CHECKSUM_ISSUE}
        )`,
    );
    await q.query(
      `UPDATE "patients" p
          SET "dataIssues" = COALESCE(
            (SELECT jsonb_agg(i ORDER BY n)
               FROM jsonb_array_elements(p."dataIssues") WITH ORDINALITY AS t(i, n)
              WHERE NOT ${IS_CHECKSUM_ISSUE}),
            '[]'::jsonb
          )
        WHERE p.id IN (SELECT "patientId" FROM "${BACKUP}")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE "patients" p SET "dataIssues" = b."dataIssues"
         FROM "${BACKUP}" b WHERE p.id = b."patientId"`,
    );
    await q.query(`DROP TABLE "${BACKUP}"`);
  }
}
