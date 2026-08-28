import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { PatientsService } from './patients.service';
import { Patient } from './patient.entity';
import { ReferralSource } from '../treatments/referral-source.entity';
import { PatientTreatment } from '../treatments/patient-treatment.entity';
import { TreatmentType } from '../treatments/treatment-type.entity';
import type { UpdatePatientDto, TreatmentInputDto } from './dto/patient.dto';
import type { AuditService } from '../../application/services/audit.service';
import { EducationLevel, Gender } from '../../domain';

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
