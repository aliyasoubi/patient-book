import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePatientDto, UpdatePatientDto } from './patient.dto';
import { UpsertRegistryCaseDto } from '../../registries/registry.dto';
import { UpsertSurgeryDto } from '../../surgery/dto/surgery.dto';

/** Runs the same transform + validate the global `ValidationPipe` applies. */
async function build<T extends object>(
  cls: new () => T,
  raw: Record<string, unknown>,
): Promise<{ dto: T; failed: string[] }> {
  const dto = plainToInstance(cls, raw, { enableImplicitConversion: false });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((e) => e.property) };
}

const VALID_PATIENT = { fileNo: '10404', firstName: 'مریم', lastName: 'کریمی' };

describe('identifier fields fold Persian and Arabic-Indic digits before validation', () => {
  it('stores a file number typed on a Persian keyboard as ASCII digits', async () => {
    const { dto, failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      fileNo: '۱۰۴۰۴',
    });

    expect(failed).toEqual([]);
    expect(dto.fileNo).toBe('10404');
  });

  it('accepts a mobile number in Persian digits and stores the local form', async () => {
    const { dto, failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      mobile: '۰۹۱۲۱۲۳۴۵۶۷',
    });

    expect(failed).toEqual([]);
    expect(dto.mobile).toBe('09121234567');
  });

  it('folds Arabic-Indic digits too', async () => {
    const { dto, failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      homePhone: '٠٢١٢٢٣٣٤٤٥٥',
    });

    expect(failed).toEqual([]);
    expect(dto.homePhone).toBe('02122334455');
  });

  it('never persists a national id in Persian digits, even though it validates', async () => {
    // 0078980501 passes the check digit; before folding, the Persian spelling
    // validated and was then stored verbatim, unequal to its ASCII twin.
    const { dto, failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      nationalId: '۰۰۷۸۹۸۰۵۰۱',
    });

    expect(failed).toEqual([]);
    expect(dto.nationalId).toBe('0078980501');
  });

  it('rejects a national id with separators rather than storing them', async () => {
    const { failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      nationalId: '007-898-0501',
    });

    expect(failed).toEqual(['nationalId']);
  });

  it('still rejects a mobile number that is wrong after folding', async () => {
    const { failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      mobile: '۹۱۲۱۲۳۴۵۶۷',
    });

    expect(failed).toEqual(['mobile']);
  });

  it('treats an empty identifier as not recorded', async () => {
    const { dto, failed } = await build(CreatePatientDto, {
      ...VALID_PATIENT,
      mobile: '',
      nationalId: '  ',
    });

    expect(failed).toEqual([]);
    expect(dto.mobile).toBeNull();
    expect(dto.nationalId).toBeNull();
  });

  it('applies to register numbers and phones on the implant/ortho registers', async () => {
    const { dto, failed } = await build(UpsertRegistryCaseDto, {
      registryNo: '۱۲۳',
      recordedName: 'رضا',
      mobile: '۰۹۳۵۰۰۰۰۰۰۰',
      homePhone: '۴۴۵۵۶۶۷۷',
    });

    expect(failed).toEqual([]);
    expect(dto.registryNo).toBe('123');
    expect(dto.mobile).toBe('09350000000');
    expect(dto.homePhone).toBe('44556677');
  });

  it('applies to the implant register number on a surgery row', async () => {
    const { dto, failed } = await build(UpsertSurgeryDto, {
      recordedName: 'رضا',
      implantRegistryNo: '۴۵',
    });

    expect(failed).toEqual([]);
    expect(dto.implantRegistryNo).toBe('45');
  });
});

describe('UpdatePatientDto', () => {
  it('requires the version the client loaded', async () => {
    const { failed } = await build(UpdatePatientDto, { mobile: '09121234567' });

    expect(failed).toEqual(['expectedVersion']);
  });

  it('accepts a positive integer version', async () => {
    const { dto, failed } = await build(UpdatePatientDto, {
      mobile: '09121234567',
      expectedVersion: 3,
    });

    expect(failed).toEqual([]);
    expect(dto.expectedVersion).toBe(3);
  });
});
