import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';

import { PatientsService } from '../../patients/patients.service';
import { UpdatePatientDto } from '../../patients/dto/patient.dto';
import { Patient } from '../../patients/patient.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { ImplantRegistryService } from '../../implants/implant-registry.service';
import { OrthoRegistryService } from '../../ortho/ortho-registry.service';
import { UpdateRegistryCaseDto } from '../../registries/registry.dto';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode, ErrorParams } from '../../../domain';
import {
  PATIENT_FIELD_READERS,
  REGISTRY_FIELD_READERS,
  RegistryLike,
} from './field-readers';
import { ApplyEntityDto, ApplyFieldDto, ApplyReconcileResult, ApplyResultRow } from '../dto/reconcile.dto';

interface RegistryUpdatable {
  update(id: string, dto: UpdateRegistryCaseDto, userId: string | null): Promise<unknown>;
}

/** A failure to report against one row, in the app's stable error vocabulary. */
interface Failure {
  code: string;
  params?: ErrorParams;
}

/**
 * Applies the subset of a reconcile preview an admin approved.
 *
 * Deliberately thin: every write goes through {@link PatientsService.update}
 * or the registry services' `update`, the exact same validated, transactional,
 * audited path a manual edit in the patient form takes.
 *
 * Two guarantees this adds on top of that:
 *
 * - **Stale previews cannot overwrite newer edits.** Each approved field
 *   carries the value the preview showed; if the record no longer holds it,
 *   the row is refused with {@link ErrorCode.ReconcileConflict} rather than
 *   clobbering whoever edited it in between. Bulk apply makes this race far
 *   likelier than it is for a single form.
 * - **One bad row never aborts the batch,** and each failure reports a real
 *   code, so an admin correcting hundreds of legacy records can see *why*.
 */
@Injectable()
export class ApplyReconcileUseCase {
  constructor(
    private readonly patients: PatientsService,
    private readonly implants: ImplantRegistryService,
    private readonly ortho: OrthoRegistryService,
    @InjectRepository(Patient) private readonly patientRepo: Repository<Patient>,
    @InjectRepository(ImplantCase) private readonly implantRepo: Repository<ImplantCase>,
    @InjectRepository(OrthoCase) private readonly orthoRepo: Repository<OrthoCase>,
  ) {}

  async execute(
    input: { patients?: ApplyEntityDto[]; implants?: ApplyEntityDto[]; ortho?: ApplyEntityDto[] },
    userId: string | null,
  ): Promise<ApplyReconcileResult> {
    return {
      patients: await this.applyPatients(input.patients ?? [], userId),
      implants: await this.applyRegistry(
        input.implants ?? [],
        userId,
        this.implants,
        this.implantRepo,
      ),
      ortho: await this.applyRegistry(input.ortho ?? [], userId, this.ortho, this.orthoRepo),
    };
  }

  private async applyPatients(
    entities: ApplyEntityDto[],
    userId: string | null,
  ): Promise<ApplyResultRow[]> {
    const results: ApplyResultRow[] = [];

    for (const entity of entities) {
      const current = await this.patientRepo.findOne({
        where: { id: entity.id },
        relations: { referralSource: true },
      });
      if (!current) {
        results.push({ id: entity.id, ok: false, code: ErrorCode.PatientNotFound });
        continue;
      }

      const stale = this.firstMismatch(entity.fields, PATIENT_FIELD_READERS, current);
      if (stale) {
        results.push({ id: entity.id, ok: false, ...stale });
        continue;
      }

      const built = await this.buildAndValidate(UpdatePatientDto, entity.fields);
      if ('code' in built) {
        results.push({ id: entity.id, ok: false, ...built });
        continue;
      }

      try {
        await this.patients.update(entity.id, built.dto, userId);
        results.push({ id: entity.id, ok: true });
      } catch (error: unknown) {
        results.push({ id: entity.id, ok: false, ...this.describe(error) });
      }
    }

    return results;
  }

  private async applyRegistry<T extends RegistryLike>(
    entities: ApplyEntityDto[],
    userId: string | null,
    service: RegistryUpdatable,
    repo: Repository<T>,
  ): Promise<ApplyResultRow[]> {
    const results: ApplyResultRow[] = [];

    for (const entity of entities) {
      const current = await repo.findOne({ where: { id: entity.id } as never });
      if (!current) {
        results.push({ id: entity.id, ok: false, code: ErrorCode.RegistryCaseNotFound });
        continue;
      }

      const stale = this.firstMismatch(entity.fields, REGISTRY_FIELD_READERS, current);
      if (stale) {
        results.push({ id: entity.id, ok: false, ...stale });
        continue;
      }

      const built = await this.buildAndValidate(UpdateRegistryCaseDto, entity.fields);
      if ('code' in built) {
        results.push({ id: entity.id, ok: false, ...built });
        continue;
      }

      try {
        await service.update(entity.id, built.dto, userId);
        results.push({ id: entity.id, ok: true });
      } catch (error: unknown) {
        results.push({ id: entity.id, ok: false, ...this.describe(error) });
      }
    }

    return results;
  }

  /**
   * The stale-write check: refuse the row if the record no longer holds the
   * value the reviewer was shown, or if it names a field reconcile may not
   * write at all.
   */
  private firstMismatch<E>(
    fields: ApplyFieldDto[],
    readers: Readonly<Record<string, (entity: E) => string | null>>,
    current: E,
  ): Failure | null {
    for (const field of fields) {
      const read = readers[field.field];
      if (!read) {
        return {
          code: ErrorCode.ReconcileFieldUnknown,
          params: { field: field.field },
        };
      }
      // `null` and `''` both mean "nothing recorded" across this data; treating
      // them as different would flag conflicts on records nobody touched.
      const held = read(current) ?? '';
      const expected = field.expectedCurrent ?? '';
      if (held !== expected) {
        return {
          code: ErrorCode.ReconcileConflict,
          params: { field: field.field, expected, actual: held },
        };
      }
    }
    return null;
  }

  /**
   * Mirrors the global `ValidationPipe` (whitelist + forbidNonWhitelisted)
   * from `main.ts` — this DTO is built and consumed inside the process, so it
   * never passes through that pipe on its own.
   */
  private async buildAndValidate<T extends object>(
    cls: new () => T,
    fields: ApplyFieldDto[],
  ): Promise<{ dto: T } | Failure> {
    const raw: Record<string, string | null> = {};
    for (const f of fields) raw[f.field] = f.proposed;

    const dto = plainToInstance(cls, raw, { enableImplicitConversion: false });
    const errors = await validate(dto as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (!errors.length) return { dto };

    return {
      code: ErrorCode.ValidationFailed,
      params: { field: errors[0]?.property ?? '' },
    };
  }

  /** Keep the thrown error's own code; only fall back when there isn't one. */
  private describe(error: unknown): Failure {
    if (error instanceof AppException) {
      return { code: error.code, params: error.params };
    }
    return { code: ErrorCode.Unexpected };
  }
}
