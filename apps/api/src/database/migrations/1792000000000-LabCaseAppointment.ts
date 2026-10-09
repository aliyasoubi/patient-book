import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The day the patient was booked to have the work fitted. A case that is back
 * at the clinic without one still needs a booking; with one it waits for the
 * day — the board's two clinic columns. Cases already at the clinic have none,
 * which is true: nobody has recorded a booking for them.
 */
export class LabCaseAppointment1792000000000 implements MigrationInterface {
  name = 'LabCaseAppointment1792000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "lab_cases" ADD COLUMN "appointmentAt" date`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "lab_cases" DROP COLUMN "appointmentAt"`);
  }
}
