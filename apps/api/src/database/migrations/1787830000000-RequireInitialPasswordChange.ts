import { MigrationInterface, QueryRunner } from 'typeorm';

/** Require administrator and never-used accounts to replace initial passwords. */
export class RequireInitialPasswordChange1787830000000 implements MigrationInterface {
  name = 'RequireInitialPasswordChange1787830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "mustChangePassword" = true WHERE "role" = 'admin' OR "lastLoginAt" IS NULL`,
    );
    // Login is case-insensitive, so storage must reject Admin/admin duplicates
    // even when two create requests race past the application-level check.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_username_lower_unique" ON "users" (lower("username"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_username_lower_unique"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mustChangePassword"`,
    );
  }
}
