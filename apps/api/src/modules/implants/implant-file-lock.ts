import { EntityManager } from 'typeorm';

/**
 * Holds the lock on a patient's implant file until the transaction ends. A
 * patient has one file, and whatever looks for theirs and opens one when
 * there is none — the register, the stock, the follow-up form — takes it
 * first, so two at once queue and the second finds the file the first opened.
 */
export async function lockImplantFile(
  manager: EntityManager,
  patientId: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `implant_case:${patientId}`,
  ]);
}
