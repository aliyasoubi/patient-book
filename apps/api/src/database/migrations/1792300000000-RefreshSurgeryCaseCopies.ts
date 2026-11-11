import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  namesDiffer,
  surgerySearchText,
} from '../../modules/surgery/case-copy';

interface LinkedRow {
  id: string;
  recordedName: string;
  toothPosition: string;
  teethFdi: number[] | null;
  implantBrand: string | null;
  implantRegistryNo: string | null;
  hasNameMismatch: boolean;
  searchText: string;
  caseRegistryNo: string;
  caseName: string;
}

/**
 * Surgery rows filed under an implant case the register renumbered or
 * renamed before the register kept them in step: their number, name warning
 * and search catch up with the case — by the same rule the register applies
 * from now on, so the two cannot disagree.
 *
 * The SQL is kept here rather than calling `refreshCaseCopies`: that helper
 * moves with the schema (it later reads `surgery_queue."patientId"`, which
 * `SurgeryQueuePatient1792500000000` adds), and a migration has to run
 * against the schema as it stood at this point.
 */
export class RefreshSurgeryCaseCopies1792300000000 implements MigrationInterface {
  name = 'RefreshSurgeryCaseCopies1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.manager.query<LinkedRow[]>(
      `SELECT s.id, s."recordedName", s."toothPosition", s."teethFdi",
              s."implantBrand", s."implantRegistryNo", s."hasNameMismatch",
              s."searchText", c."registryNo" AS "caseRegistryNo",
              c."recordedName" AS "caseName"
         FROM surgery_queue s
         JOIN implant_cases c ON c.id = s."implantCaseId"
          FOR UPDATE OF s`,
    );
    const changed = rows.flatMap((row) => {
      const implantRegistryNo = row.caseRegistryNo;
      const hasNameMismatch = namesDiffer(row.caseName, row.recordedName);
      const searchText = surgerySearchText({ ...row, implantRegistryNo });
      return implantRegistryNo === row.implantRegistryNo &&
        hasNameMismatch === row.hasNameMismatch &&
        searchText === row.searchText
        ? []
        : [{ id: row.id, implantRegistryNo, hasNameMismatch, searchText }];
    });
    if (!changed.length) return;
    await queryRunner.query(
      `UPDATE surgery_queue s
          SET "implantRegistryNo" = v.no,
              "hasNameMismatch" = v.mismatch,
              "searchText" = v.search,
              "version" = s."version" + 1,
              "updatedAt" = now()
         FROM unnest($1::uuid[], $2::text[], $3::boolean[], $4::text[])
              AS v(id, no, mismatch, search)
        WHERE s.id = v.id`,
      [
        changed.map((c) => c.id),
        changed.map((c) => c.implantRegistryNo),
        changed.map((c) => c.hasNameMismatch),
        changed.map((c) => c.searchText),
      ],
    );
  }

  public down(): Promise<void> {
    // Nothing to put back: what changed were stale copies of the case.
    return Promise.resolve();
  }
}
