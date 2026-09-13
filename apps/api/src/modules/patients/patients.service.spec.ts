import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { PatientsService } from './patients.service';
import { Patient } from './patient.entity';
import { ReferralSource } from '../treatments/referral-source.entity';
import { PatientTreatment } from '../treatments/patient-treatment.entity';
import { TreatmentType } from '../treatments/treatment-type.entity';
import type { UpdatePatientDto, TreatmentInputDto } from './dto/patient.dto';
import type { AuditService } from '../../application/services/audit.service';
import { EducationLevel, ErrorCode, Gender } from '../../domain';

interface PatientWriteHelpers {
  assign(
    patient: Patient,
    dto: UpdatePatientDto,
    referrals: Repository<ReferralSource>,
  ): Promise<void>;
  syncTreatments(
    manager: EntityManager,
    patientId: string,
    inputs: TreatmentInputDto[],
  ): Promise<void>;
}

const patient = (): Patient =>
  Object.assign(new Patient(), {
    id: 'patient-1',
    fileNo: '12',
    firstName: 'مریم',
    lastName: 'کریمی',
    fatherName: 'حسن',
    nationalId: '0013543381',
    gender: Gender.Female,
    mobile: '09121234567',
    homePhone: '22334455',
    birthDate: new Date('1989-03-21'),
    birthDateRaw: '1368',
    birthDatePrecision: 'year',
    occupation: 'پزشک',
    education: EducationLevel.Doctorate,
    medicalHistory: 'سابقه',
    homeAddress: 'خانه',
    workAddress: 'محل کار',
    notes: 'یادداشت',
    referralSourceId: 'referral-1',
  });

describe('PatientsService write mapping', () => {
  const referrals = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as unknown as Repository<ReferralSource>;
  const service = new PatientsService(
    {} as Repository<Patient>,
    referrals,
    {} as DataSource,
    {} as AuditService,
  );
  const helpers = service as unknown as PatientWriteHelpers;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats explicit null as clear for every nullable patient field', async () => {
    const record = patient();

    await helpers.assign(
      record,
      {
        fatherName: null,
        nationalId: null,
        mobile: null,
        homePhone: null,
        occupation: null,
        medicalHistory: null,
        homeAddress: null,
        workAddress: null,
        notes: null,
        referralSourceName: null,
      },
      referrals,
    );

    expect(record).toMatchObject({
      fatherName: null,
      nationalId: null,
      mobile: null,
      homePhone: null,
      occupation: null,
      medicalHistory: null,
      homeAddress: null,
      workAddress: null,
      notes: null,
      referralSourceId: null,
    });
  });

  it('leaves an omitted imprecise date untouched', async () => {
    const record = patient();
    const originalDate = record.birthDate;

    await helpers.assign(record, { occupation: 'دندانپزشک' }, referrals);

    expect(record.birthDate).toBe(originalDate);
    expect(record.birthDateRaw).toBe('1368');
    expect(record.birthDatePrecision).toBe('year');
  });

  it('preserves treatment metadata when the client only submits its code', async () => {
    const type = Object.assign(new TreatmentType(), {
      id: 'type-1',
      code: 'implant',
    });
    const performedAt = new Date('2025-08-27');
    const link = Object.assign(new PatientTreatment(), {
      id: 'link-1',
      patientId: 'patient-1',
      treatmentTypeId: type.id,
      treatmentType: type,
      performedAt,
      performedAtRaw: '1404/06/05',
      notes: 'existing note',
    });
    const deleteMock = jest.fn();
    const manager = {
      find: jest.fn((entity: unknown) =>
        Promise.resolve(entity === TreatmentType ? [type] : [link]),
      ),
      create: jest.fn(),
      delete: deleteMock,
      save: jest.fn(() => Promise.resolve()),
    } as unknown as EntityManager;

    await helpers.syncTreatments(manager, 'patient-1', [{ code: 'implant' }]);

    expect(link.performedAt).toBe(performedAt);
    expect(link.performedAtRaw).toBe('1404/06/05');
    expect(link.notes).toBe('existing note');
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('PatientsService.nameSuggestions', () => {
  interface FakeQueryBuilder {
    select: (...args: unknown[]) => FakeQueryBuilder;
    addSelect: (...args: unknown[]) => FakeQueryBuilder;
    where: (...args: unknown[]) => FakeQueryBuilder;
    groupBy: (...args: unknown[]) => FakeQueryBuilder;
    getRawMany: () => Promise<Array<{ name: string; count: string }>>;
  }

  function serviceWithRows(rows: Array<{ name: string; count: string }>): PatientsService {
    const queryBuilder: FakeQueryBuilder = {
      select: jest.fn<(...args: unknown[]) => FakeQueryBuilder>(() => queryBuilder),
      addSelect: jest.fn<(...args: unknown[]) => FakeQueryBuilder>(() => queryBuilder),
      where: jest.fn<(...args: unknown[]) => FakeQueryBuilder>(() => queryBuilder),
      groupBy: jest.fn<(...args: unknown[]) => FakeQueryBuilder>(() => queryBuilder),
      getRawMany: jest.fn<() => Promise<Array<{ name: string; count: string }>>>(() =>
        Promise.resolve(rows),
      ),
    };
    const patients = {
      createQueryBuilder: jest.fn<() => FakeQueryBuilder>(() => queryBuilder),
    } as unknown as Repository<Patient>;
    return new PatientsService(
      patients,
      {} as Repository<ReferralSource>,
      {} as DataSource,
      {} as AuditService,
    );
  }

  it('collapses letter-variant spellings into one suggestion, keeping the most common exact spelling', async () => {
    const service = serviceWithRows([
      { name: 'علی', count: '47' },
      { name: 'علي', count: '3' }, // ARABIC YEH variant of the same name
      { name: 'رضا', count: '10' },
    ]);

    await expect(service.nameSuggestions('firstName')).resolves.toEqual([
      { name: 'علی', count: 50 },
      { name: 'رضا', count: 10 },
    ]);
  });

  it('ignores blank names and sorts by total count descending', async () => {
    const service = serviceWithRows([
      { name: '', count: '2' },
      { name: 'مریم', count: '5' },
      { name: 'زهرا', count: '9' },
    ]);

    await expect(service.nameSuggestions('lastName')).resolves.toEqual([
      { name: 'زهرا', count: 9 },
      { name: 'مریم', count: 5 },
    ]);
  });
});

describe('PatientsService.update concurrency', () => {
  /** A transaction whose row lock reports `storedVersion` for the patient. */
  const makeService = (storedVersion: number) => {
    const qb = {
      setLock: () => qb,
      select: () => qb,
      where: () => qb,
      getOne: () => Promise.resolve({ id: 'patient-1', version: storedVersion }),
    };
    const manager = { getRepository: () => ({ createQueryBuilder: () => qb }) };
    const dataSource = {
      transaction: (run: (m: unknown) => Promise<void>) => run(manager),
    } as unknown as DataSource;
    const service = new PatientsService(
      {} as Repository<Patient>,
      {} as Repository<ReferralSource>,
      dataSource,
      {} as AuditService,
    );
    // Everything after the version gate is out of scope here; failing the
    // lookup proves the gate was passed without mocking the whole write path.
    const afterGate = jest
      .spyOn(service as unknown as { findPatientForAudit: () => Promise<null> }, 'findPatientForAudit')
      .mockResolvedValue(null);
    return { service, afterGate };
  };

  it('refuses a save made from a stale copy of the record', async () => {
    const { service, afterGate } = makeService(4);

    await expect(
      service.update('patient-1', { expectedVersion: 3 } as UpdatePatientDto, 'user-1'),
    ).rejects.toMatchObject({ code: ErrorCode.PatientModified });
    expect(afterGate).not.toHaveBeenCalled();
  });

  it('lets a save through when the client holds the current version', async () => {
    const { service, afterGate } = makeService(4);

    await expect(
      service.update('patient-1', { expectedVersion: 4 } as UpdatePatientDto, 'user-1'),
    ).rejects.toMatchObject({ code: ErrorCode.PatientNotFound });
    expect(afterGate).toHaveBeenCalledTimes(1);
  });

  it('does not check when the client sends no version', async () => {
    const { service, afterGate } = makeService(4);

    await expect(
      service.update('patient-1', {} as UpdatePatientDto, 'user-1'),
    ).rejects.toMatchObject({ code: ErrorCode.PatientNotFound });
    expect(afterGate).toHaveBeenCalledTimes(1);
  });
});
