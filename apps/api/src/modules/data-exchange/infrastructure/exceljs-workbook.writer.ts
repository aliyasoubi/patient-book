import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

import { Patient } from '../../patients/patient.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { TREATMENT_TYPES } from '../../../database/seeds/treatment-types.seed';
import { Gender } from '../../../domain';
import { SHEET } from '../../import/application/import-workbook.use-case';

/** Persian labels the original workbook used for this column. */
const GENDER_LABEL: Record<Gender, string> = {
  [Gender.Female]: 'زن',
  [Gender.Male]: 'مرد',
  [Gender.Unknown]: '',
};

/**
 * Writes the practice's current data back into the same workbook shape the
 * importer reads — the only place in the codebase that builds an `.xlsx`
 * file, mirroring {@link ExcelJsWorkbookReader} on the read side.
 */
@Injectable()
export class ExcelJsWorkbookWriter {
  build(data: {
    patients: Patient[];
    implants: ImplantCase[];
    ortho: OrthoCase[];
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    this.writePatients(workbook, data.patients);
    this.writeRegistry(workbook, SHEET.implants, data.implants);
    this.writeRegistry(workbook, SHEET.ortho, data.ortho);
    // Same ExcelJS/@types/node Buffer-generic mismatch as the reader's openBuffer.
    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  private writePatients(workbook: ExcelJS.Workbook, patients: Patient[]): void {
    const sheet = workbook.addWorksheet(SHEET.patients);
    sheet.addRow([
      'شماره پرونده',
      'نام بیمار',
      'نام خانوادگی بیمار',
      'شماره موبایل',
      'شماره منزل',
      'جنسیت',
      'نحوه آشنایی',
      'تاریخ تولد',
      'شغل',
      'تحصیلات',
      'نام پدر',
      'کدملی',
      'سابقه بیماری قبلی',
      'آدرس منزل',
      'آدرس محل کار',
      'تاریخ اولین مراجعه',
      'تاریخ آخرین مراجعه',
      ...TREATMENT_TYPES.map((t) => t.sheetColumn),
    ]);

    const codesOf = (p: Patient): Set<string> =>
      new Set(
        (p.treatments ?? [])
          .map((link) => link.treatmentType?.code)
          .filter(Boolean),
      );

    for (const p of patients) {
      const owned = codesOf(p);
      sheet.addRow([
        p.fileNo,
        p.firstName,
        p.lastName,
        p.mobile ?? '',
        p.homePhone ?? '',
        GENDER_LABEL[p.gender],
        p.referralSource?.name ?? '',
        p.birthDateRaw ?? '',
        p.occupation ?? '',
        p.educationRaw ?? '',
        p.fatherName ?? '',
        p.nationalId ?? '',
        p.medicalHistory ?? '',
        p.homeAddress ?? '',
        p.workAddress ?? '',
        p.firstVisitRaw ?? '',
        p.lastVisitRaw ?? '',
        ...TREATMENT_TYPES.map((t) => (owned.has(t.code) ? 'x' : '')),
      ]);
    }
  }

  private writeRegistry(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    cases: Array<{
      registryNo: string;
      recordedName: string;
      mobile: string | null;
      homePhone: string | null;
    }>,
  ): void {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow([
      'شماره پرونده',
      'نام و نام خانوادگی',
      'شماره موبایل',
      'شماره منزل',
    ]);
    for (const c of cases) {
      sheet.addRow([
        c.registryNo,
        c.recordedName,
        c.mobile ?? '',
        c.homePhone ?? '',
      ]);
    }
  }
}
