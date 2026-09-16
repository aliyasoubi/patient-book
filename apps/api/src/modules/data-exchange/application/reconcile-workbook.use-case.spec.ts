import { describe, expect, it, jest } from '@jest/globals';
import * as ExcelJS from 'exceljs';
import type { ObjectLiteral, Repository } from 'typeorm';

import { ReconcileWorkbookUseCase } from './reconcile-workbook.use-case';
import { ExcelJsWorkbookWriter } from '../infrastructure/exceljs-workbook.writer';
import type { Patient } from '../../patients/patient.entity';
import type { ImplantCase } from '../../implants/implant-case.entity';
import type { OrthoCase } from '../../ortho/ortho-case.entity';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode } from '../../../domain';

/**
 * A patient with every reconcilable field populated, so a round trip exercises
 * each column rather than passing because most of them are empty.
 * `1234567891` satisfies the national-id check digit.
 */
function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'patient-1',
    fileNo: '10404',
    firstName: 'مریم',
    lastName: 'کریمی',
    fullName: 'مریم کریمی',
    fatherName: 'رضا',
    nationalId: '1234567891',
    gender: 'female',
    mobile: '09121234567',
    homePhone: '33647506',
    occupation: 'معلم',
    education: 'bachelor',
    educationRaw: 'لیسانس',
    medicalHistory: 'فشار خون',
    homeAddress: 'تهران، خیابان ولیعصر',
    workAddress: 'تهران، مدرسه',
    birthDateRaw: '1368/05/12',
    firstVisitRaw: '1400/01/15',
    lastVisitRaw: '1403/06/01',
    referralSource: { id: 'r1', name: 'اینستاگرام' },
    treatments: [],
    ...overrides,
  } as unknown as Patient;
}

function implantCase(overrides: Partial<ImplantCase> = {}): ImplantCase {
  return {
    id: 'implant-1',
    registryNo: '1001',
    recordedName: 'مریم کریمی',
    mobile: '09121234567',
    homePhone: null,
    ...overrides,
  } as unknown as ImplantCase;
}

function orthoCase(overrides: Partial<OrthoCase> = {}): OrthoCase {
  return {
    id: 'ortho-1',
    registryNo: '3001',
    recordedName: 'علی آتشک',
    mobile: null,
    homePhone: null,
    ...overrides,
  } as unknown as OrthoCase;
}

/** Wires the use case to fixed repository contents. */
function build(data: {
  patients?: Patient[];
  implants?: ImplantCase[];
  ortho?: OrthoCase[];
}) {
  const repo = <T extends ObjectLiteral>(rows: T[]) =>
    ({
      find: jest.fn(() => Promise.resolve(rows)),
    }) as unknown as Repository<T>;
  return new ReconcileWorkbookUseCase(
    repo(data.patients ?? []),
    repo(data.implants ?? []),
    repo(data.ortho ?? []),
  );
}

describe('ReconcileWorkbookUseCase', () => {
  const writer = new ExcelJsWorkbookWriter();

  describe('round trip', () => {
    /**
     * The invariant that guards the whole feature: what the app exports must
     * read back as "nothing to change". A drift between the writer's column
     * order and the mapper's, or between a stored value and its sheet
     * spelling, shows up here as a phantom diff rather than as a silent bad
     * write against real records.
     */
    it('reports no changes for a workbook exported from the same data', async () => {
      const patients = [patient()];
      const implants = [implantCase()];
      const ortho = [orthoCase()];
      const buffer = await writer.build({ patients, implants, ortho });

      const result = await build({ patients, implants, ortho }).execute(buffer);

      expect(result.patients).toEqual([]);
      expect(result.implants).toEqual([]);
      expect(result.ortho).toEqual([]);
      expect(result.matched).toEqual({ patients: 1, implants: 1, ortho: 1 });
      expect(result.unmatched).toEqual({ patients: 0, implants: 0, ortho: 0 });
    });
  });

  describe('diffing', () => {
    it('proposes only the fields that actually differ', async () => {
      const buffer = await writer.build({
        patients: [patient({ mobile: '09350000000', homeAddress: 'کرج' })],
        implants: [],
        ortho: [],
      });

      const result = await build({ patients: [patient()] }).execute(buffer);

      expect(result.patients).toHaveLength(1);
      expect(result.patients[0].fields).toEqual(
        expect.arrayContaining([
          { field: 'mobile', current: '09121234567', proposed: '09350000000' },
          {
            field: 'homeAddress',
            current: 'تهران، خیابان ولیعصر',
            proposed: 'کرج',
          },
        ]),
      );
      expect(result.patients[0].fields).toHaveLength(2);
    });

    it('never proposes erasing a value the sheet leaves blank', async () => {
      // The workbook has no address or medical history for this patient…
      const buffer = await writer.build({
        patients: [
          patient({
            homeAddress: null,
            workAddress: null,
            medicalHistory: null,
          }),
        ],
        implants: [],
        ortho: [],
      });

      // …while the app holds all three. Blank must mean "no opinion".
      const result = await build({ patients: [patient()] }).execute(buffer);

      expect(result.patients).toEqual([]);
    });

    it('reports every current value it saw, so apply can re-check them', async () => {
      const buffer = await writer.build({
        patients: [patient({ occupation: 'پرستار' })],
        implants: [],
        ortho: [],
      });

      const result = await build({ patients: [patient()] }).execute(buffer);

      expect(result.patients[0].fields[0]).toEqual({
        field: 'occupation',
        current: 'معلم',
        proposed: 'پرستار',
      });
    });

    it('diffs the implant and ortho registers by their own numbers', async () => {
      const buffer = await writer.build({
        patients: [],
        implants: [implantCase({ mobile: '09350000000' })],
        ortho: [orthoCase({ recordedName: 'علی آتشک نژاد' })],
      });

      const result = await build({
        implants: [implantCase()],
        ortho: [orthoCase()],
      }).execute(buffer);

      expect(result.implants[0].fields).toEqual([
        { field: 'mobile', current: '09121234567', proposed: '09350000000' },
      ]);
      expect(result.ortho[0].fields).toEqual([
        {
          field: 'recordedName',
          current: 'علی آتشک',
          proposed: 'علی آتشک نژاد',
        },
      ]);
    });
  });

  describe('rows with no counterpart', () => {
    it('counts unknown file and registry numbers instead of creating records', async () => {
      const buffer = await writer.build({
        patients: [patient({ fileNo: '99999' })],
        implants: [implantCase({ registryNo: '8888' })],
        ortho: [orthoCase({ registryNo: '7777' })],
      });

      const result = await build({
        patients: [patient()],
        implants: [implantCase()],
        ortho: [orthoCase()],
      }).execute(buffer);

      expect(result.matched).toEqual({ patients: 0, implants: 0, ortho: 0 });
      expect(result.unmatched).toEqual({ patients: 1, implants: 1, ortho: 1 });
      expect(result.patients).toEqual([]);
      expect(result.implants).toEqual([]);
      expect(result.ortho).toEqual([]);
    });
  });

  describe('bad uploads', () => {
    it('rejects a file that is not a workbook with a stable 400', async () => {
      const rejection = build({}).execute(
        Buffer.from('this is not a spreadsheet'),
      );

      await expect(rejection).rejects.toBeInstanceOf(AppException);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.WorkbookUnreadable,
      });
    });

    it('rejects a workbook holding none of the sheets it knows', async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Sheet1').addRow(['a', 'b']);
      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
      const rejection = build({}).execute(buffer);

      await expect(rejection).rejects.toBeInstanceOf(AppException);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.WorkbookSheetsMissing,
      });
    });
  });
});
