import { MigrationInterface, QueryRunner } from 'typeorm';

import { refreshCaseCopies } from '../../modules/surgery/case-copy';

/**
 * Surgery rows filed under an implant case the register renumbered or
 * renamed before the register kept them in step: their number, name warning
 * and search catch up with the case — by the same rule the register applies
 * from now on, so the two cannot disagree.
 */
export class RefreshSurgeryCaseCopies1792300000000 implements MigrationInterface {
  name = 'RefreshSurgeryCaseCopies1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The rule is today's, and reads a column a later migration adds
    // (SurgeryQueuePatient). A database that has not got there yet is being
    // built from empty, or restored from before this one: built from empty it
    // has no rows to bring into step, and without this every new database —
    // CI's among them — stopped here.
    if (!(await queryRunner.hasColumn('surgery_queue', 'patientId'))) return;
    await refreshCaseCopies(queryRunner.manager);
  }

  public down(): Promise<void> {
    // Nothing to put back: what changed were stale copies of the case.
    return Promise.resolve();
  }
}
