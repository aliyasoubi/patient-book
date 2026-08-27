import { ImportReport } from './import-report';

/**
 * Renders an {@link ImportReport} for the operator running the CLI.
 *
 * English on purpose: this is a developer/operator tool reading a terminal, not
 * the practice reading the app. Keeping the console output separate from the UI
 * is what lets the report itself stay as codes.
 */
export class ImportReportFormatter {
  static toConsole(report: ImportReport): string {
    const lines: string[] = [];
    const seconds = report.finishedAt
      ? ((report.finishedAt.getTime() - report.startedAt.getTime()) / 1000).toFixed(1)
      : '?';

    lines.push('', '='.repeat(64), `  Import finished in ${seconds}s`, '='.repeat(64));

    for (const [sheet, r] of Object.entries(report.sheets)) {
      lines.push('', `  ${sheet}`);
      lines.push(`    rows read     ${r.rowsRead}`);
      lines.push(`    imported      ${r.imported}`);
      if (r.matched) {
        lines.push(
          `    linked        exact ${r.matched.exact} · by name ${r.matched.fuzzy} · unlinked ${r.matched.unmatched}`,
        );
      }
      const skipped = Object.entries(r.skipped);
      if (skipped.length) {
        const total = skipped.reduce((a, [, n]) => a + (n ?? 0), 0);
        lines.push(`    skipped       ${total}`);
        for (const [reason, n] of skipped.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))) {
          lines.push(`                    ${String(n).padStart(5)} x ${reason}`);
        }
      }
    }

    if (report.warnings.length) {
      const byField = new Map<string, typeof report.warnings>();
      for (const w of report.warnings) {
        const key = `${w.sheet} · ${w.field}`;
        byField.set(key, [...(byField.get(key) ?? []), w]);
      }
      lines.push('', '-'.repeat(64));
      lines.push(`  ${report.warnings.length} values needing review (kept, flagged in the app)`);
      lines.push('-'.repeat(64));

      for (const [key, list] of [...byField].sort((a, b) => b[1].length - a[1].length)) {
        lines.push(`    ${key}: ${list.length}`);
        for (const w of list.slice(0, 4)) {
          const params = Object.entries(w.params)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ');
          lines.push(`        row ${w.row}: ${w.code}${params ? ' ' + params : ''}`);
        }
        if (list.length > 4) lines.push(`        … and ${list.length - 4} more`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }
}
