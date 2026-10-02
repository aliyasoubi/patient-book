import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import dataSource from '../../database/data-source';
import { JalaliDate } from '../../domain';
import { ExcelJsWorkbookReader } from '../import/infrastructure/exceljs-workbook.reader';
import { cliActor, parseArgs } from '../data-exchange/cli';
import { ImportLabWorkbook, LabImportPlan } from './import/import-lab-workbook';

const STAGE_LABEL = {
  at_lab: 'at the lab',
  at_clinic: 'back at the clinic',
  delivered: 'delivered',
} as const;

/**
 * One-time load of the lab book into the lab board.
 *
 *   npm run import:labs -- path/to/لابراتوار.xlsx                 # preview only
 *   npm run import:labs -- path/to/لابراتوار.xlsx --apply         # write
 *
 * Without `--apply` nothing is written: every row is printed with what it will
 * become, and every row that will not be imported with why. With `--apply`
 * the same plan is written in one transaction. A board that already holds
 * cases is refused unless `--force` is passed, so a second run cannot double
 * them. After the import, cases are corrected in the app like any other.
 */
async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) {
    console.error(
      'usage: npm run import:labs -- <workbook.xlsx> [--apply] [--force]',
    );
    process.exit(2);
  }
  const filePath = resolve(process.cwd(), positional[0]);
  if (!existsSync(filePath)) {
    console.error(`✗  Workbook not found: ${filePath}`);
    process.exit(1);
  }

  await dataSource.initialize();
  try {
    const importer = new ImportLabWorkbook(
      dataSource,
      new ExcelJsWorkbookReader(),
    );
    const plan = await importer.plan(filePath);
    print(plan);

    if (!plan.cases.length) return;
    if (!flags.has('apply')) {
      console.log(
        `\nPreview only. Re-run with --apply to create these ${plan.cases.length} case(s).`,
      );
      return;
    }

    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM lab_cases',
    );
    if (Number(count) > 0 && !flags.has('force')) {
      console.error(
        `\n✗  The board already holds ${count} lab case(s); importing again would duplicate them.\n` +
          `   Pass --force to import anyway.`,
      );
      process.exit(1);
    }

    const created = await importer.apply(plan, cliActor());
    console.log(`\n✓  Created ${created} lab case(s).`);
  } finally {
    await dataSource.destroy();
  }
}

function print(plan: LabImportPlan): void {
  console.log(`Sheet «${plan.sheet}»\n`);
  for (const { row, patient, match } of plan.cases) {
    const link = patient ? `file ${patient.fileNo} (${match})` : 'not linked';
    console.log(
      `  row ${row.rowNumber}  ✓ ${row.recordedName} — ${row.labName} — ` +
        `${row.workTypes.join('+')} — ${row.tripKind}, sent ` +
        `${JalaliDate.fromDate(row.sentAt)!.format()} — ${STAGE_LABEL[row.stage]} — ${link}`,
    );
    for (const warning of row.warnings) console.log(`           ⚠ ${warning}`);
  }
  for (const s of plan.skipped) {
    console.log(
      `  row ${s.rowNumber}  ✗ ${s.recordedName || '—'}: ${s.reason}`,
    );
  }

  const by = (stage: keyof typeof STAGE_LABEL) =>
    plan.cases.filter((c) => c.row.stage === stage).length;
  const linked = plan.cases.filter((c) => c.patient).length;
  const back = by('at_clinic') + by('delivered');
  console.log(
    `\n${plan.cases.length} to import: ${by('at_lab')} at the lab, ${by('at_clinic')} back at the clinic, ` +
      `${by('delivered')} delivered; ${linked} linked to a patient file.\n` +
      `${plan.skipped.length} skipped, ${plan.empty} empty row(s) ignored.`,
  );
  if (back) {
    console.log(
      `The book does not say when work came back: the ${back} returned case(s) get today as that day, noted on the trip.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    '✗  Lab import failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
