import { describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';

import { ApplyReconcileUseCase } from './apply-reconcile.use-case';
import type { PatientsService } from '../../patients/patients.service';
import type { ImplantRegistryService } from '../../implants/implant-registry.service';
import type { OrthoRegistryService } from '../../ortho/ortho-registry.service';
import type { Patient } from '../../patients/patient.entity';
import type { ImplantCase } from '../../implants/implant-case.entity';
import type { OrthoCase } from '../../ortho/ortho-case.entity';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode } from '../../../domain';

/** Only the fields the reconcile readers touch need to be real here. */
function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'patient-1',
    fileNo: '10404',
    firstName: 'مریم',
    lastName: 'کریمی',
    fatherName: null,
    nationalId: null,
    gender: 'female',
    mobile: '09121234567',
    homePhone: null,
    occupation: null,
    education: 'unknown',
    medicalHistory: null,
    homeAddress: null,
    workAddress: null,
    birthDateRaw: null,
    firstVisitRaw: null,
    lastVisitRaw: null,
    referralSource: null,
    version: 7,
    ...overrides,
  } as unknown as Patient;
}

function build(options: {
  current?: Patient | null;
  update?: PatientsService['update'];
}) {
  const update =
    options.update ??
    (jest.fn(() =>
      Promise.resolve({} as never),
    ) as unknown as PatientsService['update']);
  const patients = { update } as unknown as PatientsService;

  const findOne = jest.fn(() =>
    Promise.resolve(
      options.current === undefined ? patient() : options.current,
    ),
  );
  const patientRepo = { findOne } as unknown as Repository<Patient>;
  const empty = {
    findOne: jest.fn(() => Promise.resolve(null)),
  } as unknown as Repository<ImplantCase>;

  const useCase = new ApplyReconcileUseCase(
    patients,
    { update: jest.fn() } as unknown as ImplantRegistryService,
    { update: jest.fn() } as unknown as OrthoRegistryService,
    patientRepo,
    empty,
    empty as unknown as Repository<OrthoCase>,
  );
  return { useCase, update };
}

describe('ApplyReconcileUseCase', () => {
  describe('stale-preview protection', () => {
    it('refuses a row whose value changed after the preview, without writing', async () => {
      // The preview saw 09121234567; a receptionist has since set 09990000000.
      const { useCase, update } = build({
        current: patient({ mobile: '09990000000' }),
      });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'mobile',
                  proposed: '09350000000',
                  expectedCurrent: '09121234567',
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0]).toEqual({
        id: 'patient-1',
        ok: false,
        code: ErrorCode.ReconcileConflict,
        params: {
          field: 'mobile',
          expected: '09121234567',
          actual: '09990000000',
        },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('applies when the record still holds what the preview reported', async () => {
      const { useCase, update } = build({ current: patient() });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'mobile',
                  proposed: '09350000000',
                  expectedCurrent: '09121234567',
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0]).toEqual({ id: 'patient-1', ok: true });
      expect(update).toHaveBeenCalledWith(
        'patient-1',
        expect.objectContaining({ mobile: '09350000000' }),
        'user-1',
      );
    });

    it('sends the version it checked against, so the row lock catches a later edit', async () => {
      // The field comparison above runs outside any lock. Forwarding the
      // version closes the window between that read and the write: an edit
      // landing in between bumps the version and the update is refused.
      const { useCase, update } = build({ current: patient({ version: 12 }) });

      await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'mobile',
                  proposed: '09350000000',
                  expectedCurrent: '09121234567',
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(update).toHaveBeenCalledWith(
        'patient-1',
        expect.objectContaining({ expectedVersion: 12 }),
        'user-1',
      );
    });

    it('treats an absent value and an empty string as the same "not recorded"', async () => {
      const { useCase, update } = build({
        current: patient({ homeAddress: null }),
      });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'homeAddress',
                  proposed: 'تهران',
                  expectedCurrent: null,
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0].ok).toBe(true);
      expect(update).toHaveBeenCalled();
    });

    it('checks every approved field, not only the first', async () => {
      const { useCase, update } = build({
        current: patient({ mobile: '09121234567', homeAddress: 'کرج' }),
      });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'mobile',
                  proposed: '09350000000',
                  expectedCurrent: '09121234567',
                },
                {
                  field: 'homeAddress',
                  proposed: 'تهران',
                  expectedCurrent: 'شیراز',
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0].code).toBe(ErrorCode.ReconcileConflict);
      expect(result.patients[0].params).toMatchObject({ field: 'homeAddress' });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('field allow-list', () => {
    it('refuses a field reconcile is not permitted to write', async () => {
      // Treatments are edited in the app, never driven from a spreadsheet.
      const { useCase, update } = build({ current: patient() });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'treatments',
                  proposed: 'implant',
                  expectedCurrent: null,
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0].code).toBe(ErrorCode.ReconcileFieldUnknown);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('failure reporting', () => {
    it('keeps the thrown error code instead of flattening it', async () => {
      const update = jest.fn(() =>
        Promise.reject(
          AppException.conflict(ErrorCode.FileNumberTaken, { fileNo: '10404' }),
        ),
      ) as unknown as PatientsService['update'];
      const { useCase } = build({ current: patient(), update });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'mobile',
                  proposed: '09350000000',
                  expectedCurrent: '09121234567',
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0]).toMatchObject({
        ok: false,
        code: ErrorCode.FileNumberTaken,
        params: { fileNo: '10404' },
      });
    });

    it('reports a missing patient rather than throwing', async () => {
      const { useCase } = build({ current: null });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                { field: 'mobile', proposed: '0912', expectedCurrent: null },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0].code).toBe(ErrorCode.PatientNotFound);
    });

    it('rejects a value that fails DTO validation, naming the field', async () => {
      const { useCase, update } = build({ current: patient() });

      const result = await useCase.execute(
        {
          patients: [
            {
              id: 'patient-1',
              fields: [
                {
                  field: 'mobile',
                  proposed: 'not-a-number',
                  expectedCurrent: '09121234567',
                },
              ],
            },
          ],
        },
        'user-1',
      );

      expect(result.patients[0]).toMatchObject({
        ok: false,
        code: ErrorCode.ValidationFailed,
        params: { field: 'mobile' },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('lets a later row succeed after an earlier one fails', async () => {
      const update = jest.fn((id: unknown) =>
        id === 'patient-bad'
          ? Promise.reject(AppException.notFound(ErrorCode.PatientNotFound))
          : Promise.resolve({} as never),
      ) as unknown as PatientsService['update'];

      const findOne = jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(patient({ id: where.id })),
      );
      const patientRepo = { findOne } as unknown as Repository<Patient>;
      const empty = { findOne: jest.fn(() => Promise.resolve(null)) };
      const useCase = new ApplyReconcileUseCase(
        { update } as unknown as PatientsService,
        { update: jest.fn() } as unknown as ImplantRegistryService,
        { update: jest.fn() } as unknown as OrthoRegistryService,
        patientRepo,
        empty as unknown as Repository<ImplantCase>,
        empty as unknown as Repository<OrthoCase>,
      );

      const field = {
        field: 'mobile',
        proposed: '09350000000',
        expectedCurrent: '09121234567',
      };
      const result = await useCase.execute(
        {
          patients: [
            { id: 'patient-bad', fields: [field] },
            { id: 'patient-good', fields: [field] },
          ],
        },
        'user-1',
      );

      expect(result.patients[0].ok).toBe(false);
      expect(result.patients[1].ok).toBe(true);
    });
  });
});
