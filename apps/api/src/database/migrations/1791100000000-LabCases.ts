import { MigrationInterface, QueryRunner } from 'typeorm';

import { searchKey } from '../../domain';

/** The labs the practice works with today, in the order it listed them. */
const LABS = ['فرهنگ', 'سزاوار', 'آگر', 'زنیت', 'سعید', 'راه پیما'];

/**
 * Lab work: the labs, one case per piece of work, and one row per trip of a
 * case to the lab and back. Where a case is — at the lab, back at the clinic,
 * delivered — is not a column: it follows from `deliveredAt` and whether a
 * trip is out, and the partial unique index below keeps that to one trip.
 */
export class LabCases1791100000000 implements MigrationInterface {
  name = 'LabCases1791100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "labs" (
        "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name"            varchar(80) NOT NULL,
        "normalizedName"  varchar(80) NOT NULL,
        "isActive"        boolean NOT NULL DEFAULT true,
        "sortOrder"       integer NOT NULL DEFAULT 0,
        "createdAt"       timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "idx_labs_normalized_name" ON "labs" ("normalizedName")`,
    );
    for (const [i, name] of LABS.entries()) {
      await q.query(
        `INSERT INTO "labs" ("name", "normalizedName", "sortOrder") VALUES ($1, $2, $3)`,
        [name, searchKey(name), i + 1],
      );
    }

    await q.query(
      `CREATE TYPE "lab_cases_worktypes_enum" AS ENUM
         ('crown','implant_crown','laminate','post','night_guard','sx')`,
    );
    await q.query(`
      CREATE TABLE "lab_cases" (
        "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "patientId"        uuid REFERENCES "patients"("id") ON DELETE SET NULL,
        "recordedName"     varchar(160) NOT NULL DEFAULT '',
        "labId"            uuid NOT NULL REFERENCES "labs"("id") ON DELETE RESTRICT,
        "workTypes"        "lab_cases_worktypes_enum"[] NOT NULL DEFAULT '{}',
        "toothCount"       smallint,
        "teeth"            varchar(200) NOT NULL DEFAULT '',
        "implantBrand"     varchar(60),
        "impressionCount"  smallint,
        "analogCount"      smallint,
        "partsReturnedAt"  date,
        "deliveredAt"      date,
        "notes"            text,
        "searchText"       text NOT NULL DEFAULT '',
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        "version"          integer NOT NULL DEFAULT 1,
        "deletedAt"        timestamptz
      )`);
    await q.query(
      `CREATE INDEX "idx_lab_cases_patient" ON "lab_cases" ("patientId")`,
    );
    await q.query(`CREATE INDEX "idx_lab_cases_lab" ON "lab_cases" ("labId")`);
    await q.query(
      `CREATE INDEX "idx_lab_cases_delivered" ON "lab_cases" ("deliveredAt")`,
    );
    await q.query(
      `CREATE INDEX "idx_lab_cases_search" ON "lab_cases" USING GIN ("searchText" gin_trgm_ops)`,
    );

    await q.query(
      `CREATE TYPE "lab_case_trips_kind_enum" AS ENUM
         ('impression','scan','wax_alginate','resin','frame','correction','remake')`,
    );
    await q.query(`
      CREATE TABLE "lab_case_trips" (
        "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "labCaseId"   uuid NOT NULL REFERENCES "lab_cases"("id") ON DELETE CASCADE,
        "sequence"    smallint NOT NULL,
        "kind"        "lab_case_trips_kind_enum" NOT NULL,
        "sentAt"      date NOT NULL,
        "waitDays"    smallint NOT NULL,
        "expectedAt"  date NOT NULL,
        "receivedAt"  date,
        "note"        varchar(300),
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "idx_lab_trips_sequence" ON "lab_case_trips" ("labCaseId", "sequence")`,
    );
    // At most one trip out per case: the second of two simultaneous sends fails here.
    await q.query(
      `CREATE UNIQUE INDEX "idx_lab_trips_one_open" ON "lab_case_trips" ("labCaseId")
         WHERE "receivedAt" IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "lab_case_trips"`);
    await q.query(`DROP TYPE "lab_case_trips_kind_enum"`);
    await q.query(`DROP TABLE "lab_cases"`);
    await q.query(`DROP TYPE "lab_cases_worktypes_enum"`);
    await q.query(`DROP TABLE "labs"`);
  }
}
