import { DataSource, EntityManager } from 'typeorm';

import { AuditService } from '../../application/services/audit.service';
import { cliActor, createToolContext, parseArgs } from '../data-exchange/cli';
import { surgerySearchText } from '../surgery/case-copy';

/**
 * Bring what was recorded before the current implant rules in line with them.
 *
 *   npm run implant-cleanup              # preview only
 *   npm run implant-cleanup -- --apply   # write the changes
 *
 * 1. The stock card. A use from before its lines named their follow-up is
 *    linked to the row it went into, so the row lists it — with its teeth
 *    where the rows it wrote say them, without where the day's uses had
 *    already been joined on one row and the teeth cannot be told apart.
 * 2. One follow-up per patient per day. The stock once wrote a follow-up for
 *    each implant, so three implants in a day are three follow-ups. They are
 *    merged into the day's first, with all their teeth and notes — but only
 *    while none has been called about, booked or declined; any other such day
 *    is listed for staff to settle on the cards.
 * 3. One implant file per patient. A patient linked to more than one keeps
 *    the file the stock has been writing to, else the one staff linked by
 *    hand, else the first opened; the others are unlinked. The import linked
 *    them by name, and two people can share a name, so they are not merged:
 *    staff settle each from the implant register's list of unlinked files.
 *
 * Everything runs in one transaction. Without --apply it is rolled back, so
 * the preview shows exactly what --apply would do. Records are named by file
 * and register number, never by a patient's name.
 */

/** Thrown to roll the preview back; never escapes `main`. */
class Preview extends Error {}

interface Counts {
  linked: number;
  linkedWithTeeth: number;
  unfiled: number;
  merged: number;
  archived: number;
  left: number;
  unlinked: number;
  noPatient: number;
}

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const apply = flags.has('apply');
  const app = await createToolContext();
  const audit = app.get(AuditService);
  const actor = cliActor();
  const counts: Counts = {
    linked: 0,
    linkedWithTeeth: 0,
    unfiled: 0,
    merged: 0,
    archived: 0,
    left: 0,
    unlinked: 0,
    noPatient: 0,
  };
  try {
    await app.get(DataSource).transaction(async (manager) => {
      const record: Recorder = (entity, entityId, action, changes) =>
        audit.recordRequired(
          {
            userId: null,
            username: actor,
            action,
            entity,
            entityId,
            changes: { ...changes, via: 'implant_cleanup' },
          },
          manager,
        );

      await linkStockLines(manager, counts);
      await mergeDays(manager, counts, record);
      await unlinkExtraFiles(manager, counts, record);
      await countUnnamedUses(manager, counts);

      printSummary(counts, apply);
      if (!apply) throw new Preview();
      await audit.recordRequired(
        {
          userId: null,
          username: actor,
          action: 'update',
          entity: 'patient_book',
          changes: { implantCleanup: { ...counts } },
        },
        manager,
      );
    });
  } catch (error) {
    if (!(error instanceof Preview)) throw error;
  } finally {
    await app.close();
  }
}

/** One audit line for a record the cleanup changed, signed by the operator. */
type Recorder = (
  entity: string,
  entityId: string,
  action: 'update' | 'delete',
  changes: Record<string, unknown>,
) => Promise<void>;

/**
 * Each implant use not yet filed under a follow-up is linked to the row that
 * names its line — the rows the stock wrote, one per implant once — or else
 * to the day's implant row for the patient, the one a use that day joined.
 * Its teeth are the rows' that name it, unless the day also has a use no row
 * names: those were joined on one row, whose teeth belong to all of them.
 */
async function linkStockLines(
  manager: EntityManager,
  counts: Counts,
): Promise<void> {
  const lines = await manager.query<
    Array<{ id: string; patientId: string; day: string }>
  >(
    `SELECT m.id, m."patientId", m."createdAt"::date::text AS day
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m."itemId"
      WHERE m.kind = 'use' AND i.category = 'implant'
        AND m."surgeryId" IS NULL AND m."patientId" IS NOT NULL
      ORDER BY m.seq`,
  );
  if (!lines.length) return;
  const rows = await manager.query<
    Array<{ id: string; inventoryMovementId: string; teethFdi: number[] }>
  >(
    `SELECT id, "inventoryMovementId", "teethFdi" FROM surgery_queue
      WHERE "deletedAt" IS NULL AND "inventoryMovementId" = ANY($1::uuid[])
      ORDER BY "createdAt", id`,
    [lines.map((l) => l.id)],
  );
  const naming = new Map<string, typeof rows>();
  for (const row of rows) {
    naming.set(row.inventoryMovementId, [
      ...(naming.get(row.inventoryMovementId) ?? []),
      row,
    ]);
  }
  const dayKey = (l: { patientId: string; day: string }) =>
    `${l.patientId} ${l.day}`;
  const joinedDays = new Set(
    lines.filter((l) => !naming.has(l.id)).map(dayKey),
  );

  for (const line of lines) {
    const named = naming.get(line.id);
    let rowId = named?.[0]?.id ?? null;
    let tooth: string | null = null;
    if (named && !joinedDays.has(dayKey(line))) {
      const teeth = [...new Set(named.flatMap((r) => r.teethFdi))].sort(
        (a, b) => a - b,
      );
      tooth = teeth.length ? teeth.join(' ') : null;
    }
    if (!rowId) {
      const [day] = await manager.query<Array<{ id: string }>>(
        `SELECT s.id FROM surgery_queue s
           JOIN implant_cases c ON c.id = s."implantCaseId"
          WHERE c."patientId" = $1 AND s."surgeryDate" = $2::date
            AND s.kind = 'implant' AND s.status <> 'cancelled'
            AND s."deletedAt" IS NULL
          ORDER BY s."createdAt", s.id
          LIMIT 1`,
        [line.patientId, line.day],
      );
      rowId = day?.id ?? null;
    }
    if (!rowId) {
      counts.unfiled++;
      continue;
    }
    await manager.query(
      `UPDATE inventory_movements SET "surgeryId" = $2, tooth = $3 WHERE id = $1`,
      [line.id, rowId, tooth],
    );
    counts.linked++;
    if (tooth) counts.linkedWithTeeth++;
  }
}

/**
 * The stock's follow-ups for one patient's file on one day, merged into the
 * first when none of them has moved on from "to call": its teeth, its notes,
 * and the stock card lines filed under the others become the first's, and
 * the others are archived. A day where one has been called about, booked or
 * declined, or where they disagree on the follow-up, is only listed.
 */
async function mergeDays(
  manager: EntityManager,
  counts: Counts,
  record: Recorder,
): Promise<void> {
  const rows = await manager.query<
    Array<{
      id: string;
      implantCaseId: string;
      day: string;
      fileNo: string | null;
      implantRegistryNo: string | null;
      recordedName: string;
      teethFdi: number[];
      toothPosition: string;
      implantBrand: string | null;
      notes: string | null;
      followUpStatus: string;
      followUpMonths: number | null;
      nextContactAt: string | null;
      status: string;
      abutmentType: string;
      called: boolean;
    }>
  >(
    `SELECT s.id, s."implantCaseId", s."surgeryDate"::text AS day, p."fileNo",
            s."implantRegistryNo", s."recordedName", s."teethFdi", s."toothPosition",
            s."implantBrand", s.notes, s."followUpStatus", s."followUpMonths",
            s."nextContactAt"::text AS "nextContactAt", s.status, s."abutmentType",
            EXISTS (SELECT 1 FROM follow_up_contacts f WHERE f."surgeryId" = s.id) AS called
       FROM surgery_queue s
       LEFT JOIN patients p ON p.id = s."patientId"
      WHERE s."deletedAt" IS NULL AND s.kind = 'implant' AND s.status <> 'cancelled'
        AND s."inventoryMovementId" IS NOT NULL
        AND s."implantCaseId" IS NOT NULL AND s."surgeryDate" IS NOT NULL
      ORDER BY s."implantCaseId", s."surgeryDate", s."createdAt", s.id`,
  );
  const days = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.implantCaseId} ${row.day}`;
    days.set(key, [...(days.get(key) ?? []), row]);
  }

  for (const group of days.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    const label = `file ${first.fileNo ?? '—'}, implant no. ${first.implantRegistryNo ?? '—'}, ${first.day}`;
    const settled = group.some(
      (r) => r.followUpStatus !== 'open' || r.nextContactAt || r.called,
    );
    const differ = group.some(
      (r) =>
        r.followUpMonths !== first.followUpMonths ||
        r.status !== first.status ||
        r.abutmentType !== first.abutmentType,
    );
    if (settled || differ) {
      counts.left++;
      console.log(
        `  left as it is  ${label}: ${group.length} follow-ups, ${
          settled ? 'one already called about or settled' : 'they differ'
        }`,
      );
      continue;
    }

    const teethFdi = [...new Set(group.flatMap((r) => r.teethFdi))].sort(
      (a, b) => a - b,
    );
    const toothPosition = [
      ...new Set(
        group.flatMap((r) => r.toothPosition.split(' ').filter(Boolean)),
      ),
    ].join(' ');
    const notes =
      [
        ...new Set(
          group.flatMap((r) => (r.notes ?? '').split('\n').filter(Boolean)),
        ),
      ].join('\n') || null;
    const searchText = surgerySearchText({ ...first, teethFdi, toothPosition });
    const others = rest.map((r) => r.id);

    await manager.query(
      `UPDATE surgery_queue
          SET "teethFdi" = $2, "toothPosition" = $3, notes = $4, "searchText" = $5,
              version = version + 1, "updatedAt" = now()
        WHERE id = $1`,
      [first.id, teethFdi, toothPosition, notes, searchText],
    );
    await manager.query(
      `UPDATE inventory_movements SET "surgeryId" = $1 WHERE "surgeryId" = ANY($2::uuid[])`,
      [first.id, others],
    );
    await manager.query(
      `UPDATE surgery_queue SET "deletedAt" = now(), version = version + 1
        WHERE id = ANY($1::uuid[])`,
      [others],
    );
    await record('surgery_queue', first.id, 'update', {
      teethFdi,
      toothPosition,
      notes,
      mergedFrom: others,
    });
    for (const id of others) {
      await record('surgery_queue', id, 'delete', { mergedInto: first.id });
    }
    counts.merged++;
    counts.archived += others.length;
    console.log(
      `  merged         ${label}: ${group.length} follow-ups into one, teeth ${teethFdi.join(' ')}`,
    );
  }
}

/**
 * A patient linked to more than one implant file keeps one: the file the
 * stock has been writing to, else one staff linked by hand, else the first
 * opened (the book's lower number among those opened at once). The others
 * lose the link and wait on the register's unlinked list.
 */
async function unlinkExtraFiles(
  manager: EntityManager,
  counts: Counts,
  record: Recorder,
): Promise<void> {
  const files = await manager.query<
    Array<{
      id: string;
      patientId: string;
      fileNo: string;
      registryNo: string;
      followUps: number;
    }>
  >(
    `SELECT c.id, c."patientId", p."fileNo", c."registryNo",
            (SELECT count(*)::int FROM surgery_queue s
              WHERE s."implantCaseId" = c.id AND s."deletedAt" IS NULL) AS "followUps"
       FROM implant_cases c
       JOIN patients p ON p.id = c."patientId"
      WHERE c."deletedAt" IS NULL
        AND c."patientId" IN (SELECT "patientId" FROM implant_cases
                               WHERE "deletedAt" IS NULL AND "patientId" IS NOT NULL
                               GROUP BY "patientId" HAVING count(*) > 1)
      ORDER BY c."patientId",
               EXISTS (SELECT 1 FROM surgery_queue s
                        WHERE s."implantCaseId" = c.id AND s."deletedAt" IS NULL
                          AND s."inventoryMovementId" IS NOT NULL) DESC,
               (c."matchMethod" = 'manual') DESC,
               c."createdAt", length(c."registryNo"), c."registryNo"`,
  );
  const byPatient = new Map<string, typeof files>();
  for (const file of files) {
    byPatient.set(file.patientId, [
      ...(byPatient.get(file.patientId) ?? []),
      file,
    ]);
  }
  for (const [kept, ...extra] of byPatient.values()) {
    await manager.query(
      `UPDATE implant_cases
          SET "patientId" = NULL, "matchMethod" = 'unmatched',
              version = version + 1, "updatedAt" = now()
        WHERE id = ANY($1::uuid[])`,
      [extra.map((f) => f.id)],
    );
    for (const file of extra) {
      await record('implant_case', file.id, 'update', {
        patientId: null,
        matchMethod: 'unmatched',
        keptRegistryNo: kept.registryNo,
      });
    }
    counts.unlinked += extra.length;
    console.log(
      `  one file       file ${kept.fileNo}: keeps implant no. ${kept.registryNo}; unlinked ${extra
        .map((f) => `${f.registryNo} (${f.followUps} follow-ups)`)
        .join(', ')}`,
    );
  }
}

/** Implants used before a use had to name its patient: nothing to link them to. */
async function countUnnamedUses(
  manager: EntityManager,
  counts: Counts,
): Promise<void> {
  const [row] = await manager.query<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM inventory_movements m
       JOIN inventory_items i ON i.id = m."itemId"
      WHERE m.kind = 'use' AND i.category = 'implant' AND m."patientId" IS NULL`,
  );
  counts.noPatient = row?.n ?? 0;
}

function printSummary(c: Counts, apply: boolean): void {
  console.log(`
Stock card lines linked to their follow-up: ${c.linked} (${c.linkedWithTeeth} with their teeth)
  with no follow-up to link to:            ${c.unfiled}
Days merged into one follow-up:             ${c.merged} (${c.archived} follow-ups archived)
  days left for staff:                      ${c.left}
Implant files unlinked from a second owner: ${c.unlinked}
Implant uses that name no patient (kept):   ${c.noPatient}
`);
  console.log(
    apply
      ? '✓  Written.'
      : 'Preview only: nothing was written. Re-run with --apply to write these changes.',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
