/** One row of a spreadsheet, already flattened to text. */
export interface SheetRow {
  /** 1-based row number as the spreadsheet shows it, for reporting. */
  readonly rowNumber: number;
  /** Cell text by 1-based column index; missing cells read as `''`. */
  cell(column: number): string;
}

/**
 * Reads tabular data out of a workbook.
 *
 * Declared as a port so the import use case depends on "rows of text" rather
 * than on ExcelJS. That keeps the mapping rules — which are the interesting,
 * practice-specific part — testable with plain arrays and independent of the
 * file format the practice happens to use today.
 */
export abstract class WorkbookPort {
  /** Load a workbook from disk. Must be called before {@link rows}. */
  abstract open(filePath: string): Promise<void>;

  /** Data rows of one sheet, header excluded. Empty when the sheet is absent. */
  abstract rows(sheetName: string): SheetRow[];

  /** Sheet names present in the workbook. */
  abstract sheetNames(): string[];
}
