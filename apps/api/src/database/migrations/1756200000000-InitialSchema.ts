import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema for the practice's patient book.
 *
 * Two things here are not TypeORM defaults and are deliberate:
 *
 *  1. `pg_trgm` + GIN indexes on the denormalised `searchText` columns. Postgres
 *     ships no Persian full-text dictionary, so stemming-based FTS is not an
 *     option; trigram similarity is what makes partial Persian name search and
 *     "any fragment of any phone number" search fast.
 *  2. The implant and ortho registers keep their own `registryNo`, unique within
 *     their own table and with no foreign key to `patients.fileNo` — the two
 *     numbering sequences overlap while describing different people.
 */
export class InitialSchema1756200000000 implements MigrationInterface {
  name = 'InitialSchema1756200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // ── Enum types ────────────────────────────────────────────────
    await q.query(`CREATE TYPE "users_role_enum" AS ENUM ('admin','dentist','receptionist','viewer')`);
    await q.query(`CREATE TYPE "patients_gender_enum" AS ENUM ('male','female','unknown')`);
    await q.query(
      `CREATE TYPE "patients_education_enum" AS ENUM ('none','primary','diploma','associate','bachelor','master','doctorate','student','other','unknown')`,
    );
    await q.query(`CREATE TYPE "patients_birthdateprecision_enum" AS ENUM ('day','month','year')`);
    await q.query(
      `CREATE TYPE "referral_sources_kind_enum" AS ENUM ('patient','professional','social','website','advertising','other')`,
    );
    await q.query(`CREATE TYPE "implant_cases_status_enum" AS ENUM ('active','completed','on_hold')`);
    await q.query(`CREATE TYPE "ortho_cases_status_enum" AS ENUM ('active','completed','on_hold')`);
    await q.query(`CREATE TYPE "surgery_queue_abutmenttype_enum" AS ENUM ('cover','healing','both','other','unknown')`);
    await q.query(`CREATE TYPE "surgery_queue_status_enum" AS ENUM ('scheduled','completed','cancelled')`);
    await q.query(`CREATE TYPE "surgery_queue_surgerydateprecision_enum" AS ENUM ('day','month','year')`);

    // ── users ─────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "users" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "username"      varchar(64)  NOT NULL,
        "passwordHash"  varchar(255) NOT NULL,
        "fullName"      varchar(120) NOT NULL,
        "role"          "users_role_enum" NOT NULL DEFAULT 'receptionist',
        "isActive"      boolean NOT NULL DEFAULT true,
        "tokenVersion"  integer NOT NULL DEFAULT 0,
        "lastLoginAt"   timestamptz,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "idx_users_username" ON "users" (lower("username"))`);

    // ── referral_sources ──────────────────────────────────────────
    await q.query(`
      CREATE TABLE "referral_sources" (
        "id"             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name"           varchar(120) NOT NULL,
        "normalizedName" varchar(120) NOT NULL,
        "kind"           "referral_sources_kind_enum" NOT NULL DEFAULT 'other',
        "isActive"       boolean NOT NULL DEFAULT true
      )`);
    await q.query(`CREATE UNIQUE INDEX "idx_referral_normalized" ON "referral_sources" ("normalizedName")`);

    // ── treatment_types ───────────────────────────────────────────
    await q.query(`
      CREATE TABLE "treatment_types" (
        "id"        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "code"      varchar(48) NOT NULL,
        "nameFa"    varchar(80) NOT NULL,
        "nameEn"    varchar(80) NOT NULL,
        "icon"      varchar(48) NOT NULL DEFAULT 'dentistry',
        "color"     varchar(24) NOT NULL DEFAULT 'primary',
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive"  boolean NOT NULL DEFAULT true
      )`);
    await q.query(`CREATE UNIQUE INDEX "idx_treatment_code" ON "treatment_types" ("code")`);

    // ── patients ──────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "patients" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "fileNo"              varchar(24) NOT NULL,
        "firstName"           varchar(80)  NOT NULL DEFAULT '',
        "lastName"            varchar(120) NOT NULL DEFAULT '',
        "fatherName"          varchar(80),
        "nationalId"          varchar(10),
        "gender"              "patients_gender_enum" NOT NULL DEFAULT 'unknown',
        "mobile"              varchar(20),
        "homePhone"           varchar(20),
        "birthDate"           date,
        "birthDatePrecision"  "patients_birthdateprecision_enum",
        "birthDateRaw"        varchar(40),
        "occupation"          varchar(120),
        "education"           "patients_education_enum" NOT NULL DEFAULT 'unknown',
        "educationRaw"        varchar(80),
        "referralSourceId"    uuid REFERENCES "referral_sources"("id") ON DELETE SET NULL,
        "medicalHistory"      text,
        "homeAddress"         text,
        "workAddress"         text,
        "firstVisitAt"        date,
        "firstVisitRaw"       varchar(40),
        "lastVisitAt"         date,
        "lastVisitRaw"        varchar(40),
        "notes"               text,
        "searchText"          text NOT NULL DEFAULT '',
        "dataIssues"          jsonb NOT NULL DEFAULT '[]'::jsonb,
        "isImported"          boolean NOT NULL DEFAULT false,
        "createdAt"           timestamptz NOT NULL DEFAULT now(),
        "updatedAt"           timestamptz NOT NULL DEFAULT now(),
        "deletedAt"           timestamptz,
        "createdById"         uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "updatedById"         uuid REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(`CREATE UNIQUE INDEX "idx_patients_fileno" ON "patients" ("fileNo")`);
    await q.query(`CREATE INDEX "idx_patients_national_id" ON "patients" ("nationalId")`);
    await q.query(`CREATE INDEX "idx_patients_mobile" ON "patients" ("mobile")`);
    await q.query(`CREATE INDEX "idx_patients_last_visit" ON "patients" ("lastVisitAt" DESC NULLS LAST)`);
    await q.query(`CREATE INDEX "idx_patients_deleted" ON "patients" ("deletedAt") WHERE "deletedAt" IS NULL`);
    // Trigram index: the one that makes free-text Persian search usable.
    await q.query(`CREATE INDEX "idx_patients_search" ON "patients" USING GIN ("searchText" gin_trgm_ops)`);
    // Prefix/suffix ILIKE on the same column also benefits from the GIN above.
    await q.query(`CREATE INDEX "idx_patients_lastname" ON "patients" USING GIN ("lastName" gin_trgm_ops)`);

    // ── patient_treatments ────────────────────────────────────────
    await q.query(`
      CREATE TABLE "patient_treatments" (
        "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "patientId"       uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
        "treatmentTypeId" uuid NOT NULL REFERENCES "treatment_types"("id") ON DELETE CASCADE,
        "performedAt"     date,
        "performedAtRaw"  varchar(40),
        "notes"           text,
        "createdAt"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_patient_treatment" UNIQUE ("patientId","treatmentTypeId")
      )`);
    await q.query(`CREATE INDEX "idx_pt_patient" ON "patient_treatments" ("patientId")`);
    await q.query(`CREATE INDEX "idx_pt_type" ON "patient_treatments" ("treatmentTypeId")`);

    // ── implant_cases ─────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "implant_cases" (
        "id"           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "registryNo"   varchar(24) NOT NULL,
        "patientId"    uuid REFERENCES "patients"("id") ON DELETE SET NULL,
        "recordedName" varchar(160) NOT NULL DEFAULT '',
        "matchMethod"  varchar(16) NOT NULL DEFAULT 'unmatched',
        "mobile"       varchar(20),
        "homePhone"    varchar(20),
        "status"       "implant_cases_status_enum" NOT NULL DEFAULT 'active',
        "notes"        text,
        "searchText"   text NOT NULL DEFAULT '',
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "idx_implant_registry" ON "implant_cases" ("registryNo")`);
    await q.query(`CREATE INDEX "idx_implant_patient" ON "implant_cases" ("patientId")`);
    await q.query(`CREATE INDEX "idx_implant_search" ON "implant_cases" USING GIN ("searchText" gin_trgm_ops)`);

    // ── ortho_cases ───────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "ortho_cases" (
        "id"           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "registryNo"   varchar(24) NOT NULL,
        "patientId"    uuid REFERENCES "patients"("id") ON DELETE SET NULL,
        "recordedName" varchar(160) NOT NULL DEFAULT '',
        "matchMethod"  varchar(16) NOT NULL DEFAULT 'unmatched',
        "mobile"       varchar(20),
        "homePhone"    varchar(20),
        "status"       "ortho_cases_status_enum" NOT NULL DEFAULT 'active',
        "notes"        text,
        "searchText"   text NOT NULL DEFAULT '',
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "idx_ortho_registry" ON "ortho_cases" ("registryNo")`);
    await q.query(`CREATE INDEX "idx_ortho_patient" ON "ortho_cases" ("patientId")`);
    await q.query(`CREATE INDEX "idx_ortho_search" ON "ortho_cases" USING GIN ("searchText" gin_trgm_ops)`);

    // ── surgery_queue ─────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "surgery_queue" (
        "id"                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "implantCaseId"         uuid REFERENCES "implant_cases"("id") ON DELETE SET NULL,
        "implantRegistryNo"     varchar(24),
        "recordedName"          varchar(160) NOT NULL DEFAULT '',
        "hasNameMismatch"       boolean NOT NULL DEFAULT false,
        "surgeryDate"           date,
        "surgeryDatePrecision"  "surgery_queue_surgerydateprecision_enum",
        "surgeryDateRaw"        varchar(40),
        "toothPosition"         varchar(200) NOT NULL DEFAULT '',
        "implantBrand"          varchar(60),
        "abutmentType"          "surgery_queue_abutmenttype_enum" NOT NULL DEFAULT 'unknown',
        "abutmentRaw"           varchar(60),
        "prosthesisDue"         varchar(60),
        "status"                "surgery_queue_status_enum" NOT NULL DEFAULT 'scheduled',
        "notes"                 text,
        "searchText"            text NOT NULL DEFAULT '',
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_surgery_case" ON "surgery_queue" ("implantCaseId")`);
    await q.query(`CREATE INDEX "idx_surgery_date" ON "surgery_queue" ("surgeryDate")`);
    await q.query(`CREATE INDEX "idx_surgery_search" ON "surgery_queue" USING GIN ("searchText" gin_trgm_ops)`);

    // ── audit_logs ────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "audit_logs" (
        "id"        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId"    uuid,
        "username"  varchar(80),
        "action"    varchar(16) NOT NULL,
        "entity"    varchar(48) NOT NULL,
        "entityId"  varchar(64),
        "changes"   jsonb,
        "ip"        varchar(64),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_audit_user" ON "audit_logs" ("userId")`);
    await q.query(`CREATE INDEX "idx_audit_entity" ON "audit_logs" ("entity","entityId")`);
    await q.query(`CREATE INDEX "idx_audit_created" ON "audit_logs" ("createdAt" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of [
      'audit_logs',
      'surgery_queue',
      'ortho_cases',
      'implant_cases',
      'patient_treatments',
      'patients',
      'treatment_types',
      'referral_sources',
      'users',
    ]) {
      await q.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
    for (const e of [
      'surgery_queue_surgerydateprecision_enum',
      'surgery_queue_status_enum',
      'surgery_queue_abutmenttype_enum',
      'ortho_cases_status_enum',
      'implant_cases_status_enum',
      'referral_sources_kind_enum',
      'patients_birthdateprecision_enum',
      'patients_education_enum',
      'patients_gender_enum',
      'users_role_enum',
    ]) {
      await q.query(`DROP TYPE IF EXISTS "${e}"`);
    }
  }
}
