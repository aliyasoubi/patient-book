import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

import {
  SheetRow,
  WorkbookPort,
} from '../../../application/ports/workbook.port';
import { JalaliDate } from '../../../domain';

/**
 * {@link WorkbookPort} backed by ExcelJS.
 *
 * The only place in the codebase that knows what an `.xlsx` file is. Its job is
 * to hand back plain text, flattening the several shapes ExcelJS uses for a
 * cell value (rich text, formula result, date, number) into one string.
 */
@Injectable()
export class ExcelJsWorkbookReader extends WorkbookPort {
  private workbook: ExcelJS.Workbook | null = null;

  async open(filePath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    this.workbook = workbook;
  }

  /** Load from an in-memory buffer — an uploaded file, never written to disk. */
  async openBuffer(buffer: Buffer): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS's own .d.ts predates @types/node's generic `Buffer<TArrayBuffer>`
    // and is structurally incompatible with it; the runtime value is fine.
    await workbook.xlsx.load(buffer as never);
    this.workbook = workbook;
  }

  sheetNames(): string[] {
    return this.workbook?.worksheets.map((w) => w.name) ?? [];
  }

  rows(sheetName: string): SheetRow[] {
    const sheet = this.workbook?.getWorksheet(sheetName);
    if (!sheet) return [];

    const rows: SheetRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // header
      rows.push({
        rowNumber,
        cell: (column: number) =>
          ExcelJsWorkbookReader.text(row.getCell(column).value),
      });
    });
    return rows;
  }

  /** Read a cell as trimmed text, whatever type ExcelJS decided it was. */
  private static text(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (value instanceof Date)
      return JalaliDate.fromDate(value)?.toIsoDate() ?? '';

    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string')
        return value.text.trim();
      if ('result' in value) return ExcelJsWorkbookReader.text(value.result);
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText
          .map((t) => t.text)
          .join('')
          .trim();
      }
    }
    // What is left is a cell error such as `#N/A`, which holds no text.
    return '';
  }
}
