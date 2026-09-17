import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AuditService } from '../../application/services/audit.service';
import { ExportWorkbookUseCase } from './application/export-workbook.use-case';
import { cliActor, createToolContext, parseArgs } from './cli';

/**
 * Snapshot the whole register into an Excel workbook.
 *
 *   npm run export -- [path/to/output.xlsx]
 *
 * Defaults to `patient-book-<date>.xlsx` in the current directory. The file is
 * a bulk extract of patient data: it is written readable by the current user
 * only, and the export is audited — with row counts, never the values — the
 * same way the old settings-screen download was.
 */
async function main(): Promise<void> {
  const { positional } = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const outPath = resolve(
    process.cwd(),
    positional[0] ?? `patient-book-${stamp}.xlsx`,
  );

  const app = await createToolContext();
  try {
    const { buffer, counts } = await app.get(ExportWorkbookUseCase).execute();
    await app.get(AuditService).recordRequired({
      userId: null,
      username: cliActor(),
      action: 'export',
      entity: 'patient_book',
      changes: counts,
    });
    await writeFile(outPath, buffer, { mode: 0o600 });
    console.log(
      `✓  wrote ${outPath}\n` +
        `   patients: ${counts.patients}  implants: ${counts.implants}  ortho: ${counts.ortho}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    '✗  Export failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
