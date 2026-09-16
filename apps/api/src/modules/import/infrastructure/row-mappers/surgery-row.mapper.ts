import { SheetRow } from '../../../../application/ports/workbook.port';
import {
  AbutmentType,
  DatePrecisionEnum,
  ErrorCode,
  ErrorParams,
  JalaliDate,
  SurgeryStatus,
  classifyAbutment,
  extractImplantBrand,
  searchKey,
} from '../../../../domain';

export interface MappedSurgeryRow {
  implantRegistryNo: string | null;
  recordedName: string;
  surgeryDate: Date | null;
  surgeryDatePrecision: DatePrecisionEnum | null;
  surgeryDateRaw: string | null;
  toothPosition: string;
  implantBrand: string | null;
  abutmentType: AbutmentType;
  abutmentRaw: string | null;
  prosthesisDue: string | null;
  status: SurgeryStatus;
  searchText: string;
  /** Set when the surgery date could not be read. */
  dateProblem: {
    code: ErrorCode;
    params: ErrorParams;
    rawValue: string;
  } | null;
}

export const SURGERY_COLUMN = {
  surgeryDate: 1,
  implantRegistryNo: 2,
  fullName: 3,
  toothPosition: 4,
  abutment: 5,
  prosthesisDue: 6,
} as const;

/**
 * Maps a row of the second-stage surgery waiting list.
 *
 * The number in these rows is an **implant register** number, not a patient
 * file number. Whether it still points at the person named here is decided by
 * the caller, which holds the register.
 */
export class SurgeryRowMapper {
  map(row: SheetRow, now: Date = new Date()): MappedSurgeryRow | null {
    const cell = (c: number): string => row.cell(c);

    const registryNo = cell(SURGERY_COLUMN.implantRegistryNo);
    const recordedName = cell(SURGERY_COLUMN.fullName);
    if (!registryNo && !recordedName) return null;

    const toothPosition = cell(SURGERY_COLUMN.toothPosition);
    const abutmentRaw = cell(SURGERY_COLUMN.abutment);
    const surgeryRaw = cell(SURGERY_COLUMN.surgeryDate);

    const mapped: MappedSurgeryRow = {
      implantRegistryNo: registryNo || null,
      recordedName,
      surgeryDate: null,
      surgeryDatePrecision: null,
      surgeryDateRaw: surgeryRaw || null,
      toothPosition,
      // The practice writes brand, tooth and quadrant in one phrase; the brand
      // is the recognisable leading token.
      implantBrand: extractImplantBrand(toothPosition),
      abutmentType: classifyAbutment(abutmentRaw),
      abutmentRaw: abutmentRaw || null,
      prosthesisDue: cell(SURGERY_COLUMN.prosthesisDue) || null,
      status: SurgeryStatus.Scheduled,
      searchText: searchKey(
        [
          registryNo,
          recordedName,
          toothPosition,
          extractImplantBrand(toothPosition),
        ]
          .filter(Boolean)
          .join(' '),
      ),
      dateProblem: null,
    };

    if (!surgeryRaw) return mapped;

    const parsed = JalaliDate.tryParse(surgeryRaw);
    if (parsed instanceof JalaliDate) {
      mapped.surgeryDate = parsed.date;
      mapped.surgeryDatePrecision = parsed.precision as DatePrecisionEnum;
      // A date already past means the surgery has happened.
      mapped.status = parsed.isBefore(now)
        ? SurgeryStatus.Completed
        : SurgeryStatus.Scheduled;
    } else {
      mapped.dateProblem = {
        code: parsed.code,
        params: parsed.params,
        rawValue: surgeryRaw,
      };
    }
    return mapped;
  }
}
