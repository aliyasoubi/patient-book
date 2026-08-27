import 'reflect-metadata';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

import dataSource from '../../database/data-source';
import { ExcelJsWorkbookReader } from './infrastructure/exceljs-workbook.reader';
import { ImportWorkbookUseCase } from './application/import-workbook.use-case';
import { ImportReportFormatter } from './application/import-report.formatter';

const DEFAULT_WORKBOOK = '../../data/patients-source.xlsx';

/**
 * One-shot migration of the practice's workbook into the database.
 *
 *   npm run import -- [path/to/workbook.xlsx] [--force]
 *
 * Refuses to run against a database that already holds patients unless
 * `--force` is passed, so a second run cannot silently double the register.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const filePath = resolve(process.cwd(), fileArg ?? DEFAULT_WORKBOOK);

  if (!existsSync(filePath)) {
    console.error(`Workbook not found: ${filePath}`);
    process.exit(1);
  }

  await dataSource.initialize();
  try {
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM patients',
    );
    if (Number(count) > 0 && !force) {
      console.error(
        `The database already holds ${count} patients.\n` +
          `Re-running would duplicate them. Clear it first, then pass --force:\n` +
          `  TRUNCATE patients, implant_cases, ortho_cases, surgery_queue,\n` +
          `           patient_treatments RESTART IDENTITY CASCADE;`,
      );
      process.exit(1);
    }

    console.log(`Reading ${filePath} …`);
    const useCase = new ImportWorkbookUseCase(dataSource, new ExcelJsWorkbookReader());
    const report = await useCase.execute(filePath);
    console.log(ImportReportFormatter.toConsole(report));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Import failed:', error);
  process.exit(1);
});
