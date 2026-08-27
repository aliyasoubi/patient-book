import { ErrorCode, ErrorParams } from '../../../domain';

/** What an import run did, and everything it could not do cleanly. */
export interface ImportReport {
  startedAt: Date;
  finishedAt: Date | null;
  sheets: Record<string, SheetReport>;
  warnings: ImportWarning[];
}

export interface SheetReport {
  rowsRead: number;
  imported: number;
  /** Rows deliberately skipped, counted by reason code. */
  skipped: Partial<Record<SkipReason, number>>;
  matched?: MatchTally;
}

/**
 * How register rows were linked. `manual` is absent by construction: an import
 * only ever infers a link, so a manual one cannot arise here.
 */
export interface MatchTally {
  exact: number;
  fuzzy: number;
  unmatched: number;
}

/** Why an import skipped a row. Codes, so the report can be rendered anywhere. */
export enum SkipReason {
  NoFileNumber = 'SKIP_NO_FILE_NUMBER',
  ReservedFileNumber = 'SKIP_RESERVED_FILE_NUMBER',
  DuplicateFileNumber = 'SKIP_DUPLICATE_FILE_NUMBER',
  NoRegistryNumber = 'SKIP_NO_REGISTRY_NUMBER',
  DuplicateRegistryNumber = 'SKIP_DUPLICATE_REGISTRY_NUMBER',
  EmptyRow = 'SKIP_EMPTY_ROW',
}

export interface ImportWarning {
  sheet: string;
  row: number;
  field: string;
  code: ErrorCode | string;
  params: ErrorParams;
  rawValue?: string;
}

export function emptySheetReport(): SheetReport {
  return { rowsRead: 0, imported: 0, skipped: {} };
}

export function countSkip(report: SheetReport, reason: SkipReason): void {
  report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
}
