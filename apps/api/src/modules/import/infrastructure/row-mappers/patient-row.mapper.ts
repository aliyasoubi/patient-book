import { SheetRow } from '../../../../application/ports/workbook.port';
import {
  DataIssue,
  DatePrecisionEnum,
  ErrorCode,
  JalaliDate,
  LandlineNumber,
  MobileNumber,
  NationalId,
  classifyEducation,
  classifyGender,
  dataIssue,
} from '../../../../domain';
import { Patient } from '../../../patients/patient.entity';
import { TREATMENT_TYPES } from '../../../../database/seeds/treatment-types.seed';

/** Column positions in the main sheet, 1-based as spreadsheets number them. */
export const PATIENT_COLUMN = {
  fileNo: 1,
  firstName: 2,
  lastName: 3,
  mobile: 4,
  homePhone: 5,
  gender: 6,
  referral: 7,
  birthDate: 8,
  occupation: 9,
  education: 10,
  fatherName: 11,
  nationalId: 12,
  medicalHistory: 13,
  homeAddress: 14,
  workAddress: 15,
  firstVisit: 16,
  lastVisit: 17,
  /** The thirteen treatment flag columns start here. */
  firstTreatment: 18,
} as const;

export interface MappedPatientRow {
  patient: Patient;
  /** Catalogue codes ticked on this row. */
  treatmentCodes: string[];
  /** Referral source as written, for the caller to deduplicate. */
  referralRaw: string;
  issues: DataIssue[];
}

/** The three Jalali date columns, and where each one's parts are stored. */
const DATE_COLUMNS = [
  { column: PATIENT_COLUMN.birthDate, field: 'birthDate', raw: 'birthDateRaw' },
  { column: PATIENT_COLUMN.firstVisit, field: 'firstVisitAt', raw: 'firstVisitRaw' },
  { column: PATIENT_COLUMN.lastVisit, field: 'lastVisitAt', raw: 'lastVisitRaw' },
] as const;

/**
 * Turns one row of the practice's main sheet into a {@link Patient}.
 *
 * Every value the source holds is preserved. Where a value cannot be
 * interpreted — a month of 20, a Gregorian year in a Jalali column, a national
 * id that fails its check digit — the original is kept and a {@link DataIssue}
 * is attached so a human can resolve it in the app, rather than the import
 * silently discarding or "correcting" it.
 */
export class PatientRowMapper {
  /**
   * @returns the mapped row, or `null` when the row is a reserved file number
   *          carrying no data at all and should be skipped.
   */
  map(row: SheetRow): MappedPatientRow | null {
    const cell = (c: number): string => row.cell(c);

    const fileNo = cell(PATIENT_COLUMN.fileNo);
    const firstName = cell(PATIENT_COLUMN.firstName);
    const lastName = cell(PATIENT_COLUMN.lastName);
    const mobileRaw = cell(PATIENT_COLUMN.mobile);

    // 577 rows in this workbook are pre-allocated file numbers with no name, no
    // phone and no clinical data. They are blank folders, not patients.
    if (!fileNo || (!firstName && !lastName && !mobileRaw)) return null;

    const issues: DataIssue[] = [];
    const patient = new Patient();

    patient.fileNo = fileNo;
    patient.firstName = firstName;
    patient.lastName = lastName;
    patient.fatherName = cell(PATIENT_COLUMN.fatherName) || null;
    patient.gender = classifyGender(cell(PATIENT_COLUMN.gender));
    patient.occupation = cell(PATIENT_COLUMN.occupation) || null;
    patient.medicalHistory = cell(PATIENT_COLUMN.medicalHistory) || null;
    patient.homeAddress = cell(PATIENT_COLUMN.homeAddress) || null;
    patient.workAddress = cell(PATIENT_COLUMN.workAddress) || null;
    patient.isImported = true;

    const educationRaw = cell(PATIENT_COLUMN.education);
    patient.education = classifyEducation(educationRaw);
    patient.educationRaw = educationRaw || null;

    this.applyPhones(patient, mobileRaw, cell(PATIENT_COLUMN.homePhone), issues);
    this.applyNationalId(patient, cell(PATIENT_COLUMN.nationalId), issues);
    this.applyDates(patient, cell, issues);

    patient.dataIssues = issues;
    patient.buildSearchText();

    return {
      patient,
      treatmentCodes: this.readTreatmentFlags(cell),
      referralRaw: cell(PATIENT_COLUMN.referral),
      issues,
    };
  }

  private applyPhones(
    patient: Patient,
    mobileRaw: string,
    homeRaw: string,
    issues: DataIssue[],
  ): void {
    patient.mobile = MobileNumber.normalise(mobileRaw);
    if (mobileRaw && patient.mobile && !MobileNumber.isValid(patient.mobile)) {
      issues.push(
        dataIssue(
          'mobile',
          ErrorCode.MobileInvalid,
          { length: patient.mobile.length },
          mobileRaw,
        ),
      );
    }
    // A bare underscore is how this sheet marks "no landline".
    patient.homePhone = homeRaw === '_' ? null : LandlineNumber.normalise(homeRaw);
  }

  private applyNationalId(patient: Patient, raw: string, issues: DataIssue[]): void {
    if (!raw) return;

    const padded = NationalId.pad(raw);
    if (padded?.length === 10) {
      patient.nationalId = padded;
      if (!NationalId.isValid(padded)) {
        issues.push(dataIssue('nationalId', ErrorCode.NationalIdChecksum, {}, raw));
      }
      return;
    }

    patient.nationalId = null;
    issues.push(
      dataIssue('nationalId', ErrorCode.NationalIdLength, { length: padded?.length ?? 0 }, raw),
    );
  }

  private applyDates(
    patient: Patient,
    cell: (c: number) => string,
    issues: DataIssue[],
  ): void {
    for (const { column, field, raw } of DATE_COLUMNS) {
      const value = cell(column);
      patient[raw] = value || null;
      if (!value) continue;

      const parsed = JalaliDate.tryParse(value);
      if (parsed instanceof JalaliDate) {
        patient[field] = parsed.date;
        if (field === 'birthDate') {
          patient.birthDatePrecision = parsed.precision as DatePrecisionEnum;
        }
        continue;
      }
      issues.push(dataIssue(field, parsed.code, parsed.params, value));
    }
  }

  /** Any non-empty mark in a treatment column counts as a yes. */
  private readTreatmentFlags(cell: (c: number) => string): string[] {
    return TREATMENT_TYPES.filter((_, i) => cell(PATIENT_COLUMN.firstTreatment + i)).map(
      (t) => t.code,
    );
  }
}
