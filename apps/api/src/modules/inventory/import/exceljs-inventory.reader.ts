import * as ExcelJS from 'exceljs';

import { RawCell, RawSheet, RawWorkbook } from './inventory-workbook.mapper';

/**
 * The workbook's cells as they are, for {@link mapInventoryWorkbook}: dates
 * still dates with the format they were shown in, numbers still numbers, and
 * merged cells marked — the stock sheet's mapper needs all three, which the
 * patient importer's text-only reader flattens away.
 */
export async function readInventoryWorkbook(
  filePath: string,
): Promise<RawWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = new Map<string, RawSheet>();
  for (const worksheet of workbook.worksheets) {
    sheets.set(worksheet.name.trim(), {
      rowCount: worksheet.rowCount,
      cell: (row, col) => rawCell(worksheet.getRow(row).getCell(col)),
    });
  }
  return sheets;
}

function rawCell(cell: ExcelJS.Cell): RawCell {
  return {
    value: plain(cell.value),
    numFmt: cell.numFmt || undefined,
    merged: cell.isMerged,
  };
}

/** One of the shapes ExcelJS gives a value in, as string, number or date. */
function plain(value: ExcelJS.CellValue): RawCell['value'] {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === 'boolean') return String(value);
  if ('result' in value) return plain(value.result);
  if ('richText' in value) return value.richText.map((t) => t.text).join('');
  if ('text' in value && typeof value.text === 'string') return value.text;
  // A cell error such as `#N/A` holds nothing to import.
  return null;
}
