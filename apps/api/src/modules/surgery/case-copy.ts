import type { EntityManager } from 'typeorm';

import { PatientNameMatcher, searchKey } from '../../domain';

/** What a surgery row is found by. */
export interface SurgerySearchFields {
  implantRegistryNo: string | null;
  recordedName: string | null;
  toothPosition: string | null;
  teethFdi: readonly number[] | null;
  implantBrand: string | null;
}

/** The folded search over a row: its implant number, name, teeth and brand. */
export function surgerySearchText(row: SurgerySearchFields): string {
  return searchKey(
    [
      row.implantRegistryNo,
      row.recordedName,
      row.toothPosition,
      (row.teethFdi ?? []).join(' '),
      row.implantBrand,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Whether a row names someone other than the implant case it is filed under —
 * a register number reused for a second person. A missing name on either
 * side is not a mismatch.
 */
export function namesDiffer(
  caseName: string | null,
  rowName: string | null,
): boolean {
  return PatientNameMatcher.namesDiffer(caseName ?? '', rowName ?? '');
}

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
  patientId: string | null;
  casePatientId: string | null;
}

/**
 * Bring what surgery rows keep of their implant case — its number, whether
 * the two names agree, and the search over both — up to date with the case,
 * after the register renumbered or renamed it. Without this the card shows
 * the case's number but a search for it misses, and the name warning stays
 * as it was the last time the row itself was saved.
 *
 * A row with no patient of its own takes the case's, once the register has
 * linked one and the two names agree — the same rule a save applies.
 *
 * Only rows that change are written, and their version moves: a surgery
 * form opened before would otherwise send the old number back as a change
 * and file the row under a new, empty case.
 *
 * The rows are read locked. A surgery edit saving one of them at the same
 * moment is waited for, and the row is worked out as that edit left it:
 * read without the lock, the warning and search would be worked out from
 * the name it had before, and written over the edit. Lock order cannot
 * cross: a surgery edit locks its row and only reads the case.
 *
 * `caseIds` narrows it to those cases; without it, every linked row.
 */
export async function refreshCaseCopies(
  manager: EntityManager,
  caseIds?: readonly string[],
): Promise<number> {
  const rows = await manager.query<LinkedRow[]>(
    `SELECT s.id, s."recordedName", s."toothPosition", s."teethFdi",
            s."implantBrand", s."implantRegistryNo", s."hasNameMismatch",
            s."searchText", c."registryNo" AS "caseRegistryNo",
            c."recordedName" AS "caseName", s."patientId",
            c."patientId" AS "casePatientId"
       FROM surgery_queue s
       JOIN implant_cases c ON c.id = s."implantCaseId"
      ${caseIds ? `WHERE s."implantCaseId" = ANY($1::uuid[])` : ''}
        FOR UPDATE OF s`,
    caseIds ? [caseIds] : [],
  );
  const changed = rows.flatMap((row) => {
    const implantRegistryNo = row.caseRegistryNo;
    const hasNameMismatch = namesDiffer(row.caseName, row.recordedName);
    const searchText = surgerySearchText({ ...row, implantRegistryNo });
    const patientId =
      row.patientId ?? (hasNameMismatch ? null : (row.casePatientId ?? null));
    return implantRegistryNo === row.implantRegistryNo &&
      hasNameMismatch === row.hasNameMismatch &&
      searchText === row.searchText &&
      patientId === (row.patientId ?? null)
      ? []
      : [
          {
            id: row.id,
            implantRegistryNo,
            hasNameMismatch,
            searchText,
            patientId,
          },
        ];
  });
  if (!changed.length) return 0;
  await manager.query(
    `UPDATE surgery_queue s
        SET "implantRegistryNo" = v.no,
            "hasNameMismatch" = v.mismatch,
            "searchText" = v.search,
            "patientId" = v.patient,
            "version" = s."version" + 1,
            "updatedAt" = now()
       FROM unnest($1::uuid[], $2::text[], $3::boolean[], $4::text[], $5::uuid[])
            AS v(id, no, mismatch, search, patient)
      WHERE s.id = v.id`,
    [
      changed.map((c) => c.id),
      changed.map((c) => c.implantRegistryNo),
      changed.map((c) => c.hasNameMismatch),
      changed.map((c) => c.searchText),
      changed.map((c) => c.patientId),
    ],
  );
  return changed.length;
}
