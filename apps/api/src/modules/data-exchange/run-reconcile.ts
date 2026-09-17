import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AppException } from '../../application/errors/app.exception';
import { AuditService } from '../../application/services/audit.service';
import { ApplyReconcileUseCase } from './application/apply-reconcile.use-case';
import { ReconcileWorkbookUseCase } from './application/reconcile-workbook.use-case';
import type {
  ApplyEntityDto,
  ApplyResultRow,
  CaseDiff,
  PatientDiff,
  ReconcilePreviewResult,
} from './dto/reconcile.dto';
import { cliActor, createToolContext, parseArgs } from './cli';

/**
 * Correct existing records from an updated workbook.
 *
 *   npm run reconcile -- path/to/workbook.xlsx            # preview only
 *   npm run reconcile -- path/to/workbook.xlsx --apply    # write the changes
 *
 * Rows are matched to records by file number (patients) or register number
 * (implant/ortho); rows with no match are counted, never created — that is
 * the importer's job. Without `--apply` nothing is written: the tool prints
 * every field that differs so the operator can read it first. With `--apply`
 * exactly those changes are written, each one still checked against the
 * current value and the record's version, so a record edited in the app in
 * the meantime is refused rather than overwritten.
 */
async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const fileArg = positional[0];
  if (!fileArg) {
    console.error('usage: npm run reconcile -- <workbook.xlsx> [--apply]');
    process.exit(2);
  }
  const filePath = resolve(process.cwd(), fileArg);
  if (!existsSync(filePath)) {
    console.error(`✗  Workbook not found: ${filePath}`);
    process.exit(1);
  }

  const app = await createToolContext();
  try {
    const preview = await app
      .get(ReconcileWorkbookUseCase)
      .execute(await readFile(filePath));
    printPreview(preview);

    const changes = countChanges(preview);
    if (!changes) return;

    if (!flags.has('apply')) {
      console.log(
        `\nPreview only. Re-run with --apply to write these ${changes} change(s).`,
      );
      return;
    }

    const result = await app.get(ApplyReconcileUseCase).execute(
      {
        patients: preview.patients.map(toApplyEntity),
        implants: preview.implants.map(toApplyEntity),
        ortho: preview.ortho.map(toApplyEntity),
      },
      null,
    );
    printResults('patients', result.patients, preview.patients);
    printResults('implants', result.implants, preview.implants);
    printResults('ortho', result.ortho, preview.ortho);

    // Each applied row is audited by the service that wrote it, but with no
    // signed-in user; this one line records who ran the batch and from what.
    const applied = [
      ...result.patients,
      ...result.implants,
      ...result.ortho,
    ].filter((r) => r.ok);
    await app.get(AuditService).recordRequired({
      userId: null,
      username: cliActor(),
      action: 'update',
      entity: 'patient_book',
      changes: {
        reconcile: {
          workbook: filePath,
          applied: applied.length,
          proposed: changes,
        },
      },
    });
  } finally {
    await app.close();
  }
}

function countChanges(p: ReconcilePreviewResult): number {
  return [...p.patients, ...p.implants, ...p.ortho].reduce(
    (n, d) => n + d.fields.length,
    0,
  );
}

/** Every proposed field, pinned to the value the preview showed as current. */
function toApplyEntity(diff: PatientDiff | CaseDiff): ApplyEntityDto {
  return {
    id: diff.id,
    fields: diff.fields.map((f) => ({
      field: f.field,
      proposed: f.proposed,
      expectedCurrent: f.current,
    })),
  };
}

function printPreview(p: ReconcilePreviewResult): void {
  const section = (
    name: string,
    diffs: Array<PatientDiff | CaseDiff>,
    matched: number,
    unmatched: number,
  ) => {
    console.log(
      `\n${name}: ${matched} matched, ${unmatched} unmatched, ${diffs.length} with changes`,
    );
    for (const diff of diffs) {
      console.log(`  ${label(diff)}`);
      for (const f of diff.fields) {
        console.log(
          `      ${f.field}: ${show(f.current)} → ${show(f.proposed)}`,
        );
      }
    }
  };
  section('patients', p.patients, p.matched.patients, p.unmatched.patients);
  section('implants', p.implants, p.matched.implants, p.unmatched.implants);
  section('ortho', p.ortho, p.matched.ortho, p.unmatched.ortho);

  const totalMatched =
    p.matched.patients + p.matched.implants + p.matched.ortho;
  const totalUnmatched =
    p.unmatched.patients + p.unmatched.implants + p.unmatched.ortho;
  if (totalMatched === 0 && totalUnmatched > 0) {
    console.log(
      '\n⚠  Nothing in this workbook matched an existing record. Reconcile only ' +
        'corrects records that already exist; to load a workbook into an empty ' +
        'register use `npm run import`.',
    );
  }
}

function printResults(
  name: string,
  rows: ApplyResultRow[],
  diffs: Array<PatientDiff | CaseDiff>,
): void {
  if (!rows.length) return;
  const byId = new Map(diffs.map((d) => [d.id, d]));
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\n${name}: ${ok}/${rows.length} applied`);
  for (const row of rows.filter((r) => !r.ok)) {
    const diff = byId.get(row.id);
    const params = row.params ? ` ${JSON.stringify(row.params)}` : '';
    console.log(`  ✗ ${diff ? label(diff) : row.id}: ${row.code}${params}`);
  }
}

function label(diff: PatientDiff | CaseDiff): string {
  return 'fileNo' in diff
    ? `#${diff.fileNo} ${diff.fullName}`
    : `#${diff.registryNo} ${diff.recordedName}`;
}

function show(value: string | null): string {
  return value === null || value === '' ? '—' : value;
}

main().catch((error: unknown) => {
  // A wrong file is the operator's mistake, reported by code; anything else
  // keeps its stack for the person debugging it.
  if (error instanceof AppException) {
    console.error(`✗  ${error.code} ${JSON.stringify(error.params)}`);
  } else {
    console.error('✗  Reconcile failed:', error);
  }
  process.exit(1);
});
