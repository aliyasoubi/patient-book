import * as ExcelJS from 'exceljs';

import { classifyEducation, EducationLevel, Gender } from '../../../domain';
import { Patient } from '../../patients/patient.entity';
import { SHEET } from '../../import/application/import-workbook.use-case';
import { PATIENT_COLUMN } from '../../import/infrastructure/row-mappers/patient-row.mapper';
import {
  educationCell,
  ExcelJsWorkbookWriter,
} from './exceljs-workbook.writer';

describe('educationCell', () => {
  it('keeps the imported spelling while it still matches the level', () => {
    expect(
      educationCell({
        education: EducationLevel.Master,
        educationRaw: 'کارشناسی ارشد',
      }),
    ).toBe('کارشناسی ارشد');
  });

  it('writes the edited level, not stale imported text', () => {
    expect(
      educationCell({
        education: EducationLevel.Doctorate,
        educationRaw: 'دیپلم',
      }),
    ).toBe('دکترا');
  });

  it('writes a level entered in the app, with no imported text', () => {
    expect(
      educationCell({ education: EducationLevel.Bachelor, educationRaw: null }),
    ).toBe('لیسانس');
  });

  it.each(Object.values(EducationLevel))(
    'round-trips %s through the importer',
    (level) => {
      const cell = educationCell({ education: level, educationRaw: null });
      expect(classifyEducation(cell)).toBe(level);
    },
  );
});

describe('ExcelJsWorkbookWriter national id column', () => {
  it('writes the code as text, so Excel keeps its leading zeros', async () => {
    const patient = Object.assign(new Patient(), {
      fileNo: '1',
      firstName: 'مریم',
      lastName: 'کریمی',
      gender: Gender.Female,
      education: EducationLevel.None,
      nationalId: '0012345678',
      treatments: [],
    });
    const buffer = await new ExcelJsWorkbookWriter().build({
      patients: [patient],
      implants: [],
      ortho: [],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet(SHEET.patients)!;
    const cell = sheet.getRow(2).getCell(PATIENT_COLUMN.nationalId);

    expect(cell.value).toBe('0012345678');
    expect(cell.numFmt).toBe('@');
  });
});
