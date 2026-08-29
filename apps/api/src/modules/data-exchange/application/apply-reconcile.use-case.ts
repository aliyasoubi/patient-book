import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PatientsService } from '../../patients/patients.service';
import { UpdatePatientDto } from '../../patients/dto/patient.dto';
import { ImplantRegistryService } from '../../implants/implant-registry.service';
import { OrthoRegistryService } from '../../ortho/ortho-registry.service';
import { UpdateRegistryCaseDto } from '../../registries/registry.dto';
import { ApplyEntityDto, ApplyReconcileResult, ApplyResultRow } from '../dto/reconcile.dto';

interface RegistryUpdatable {
  update(id: string, dto: UpdateRegistryCaseDto, userId: string | null): Promise<unknown>;
}

/**
 * Applies the subset of a reconcile preview an admin approved.
 *
 * Deliberately thin: every write goes through {@link PatientsService.update}
 * or the registry services' `update`, the exact same validated, transactional,
 * audited path a manual edit in the patient form takes. This use case only
 * assembles the DTOs and reports per-row success/failure — one bad row (a
 * national id that fails its check digit, say) never aborts the rest of the
 * batch.
 */
@Injectable()
export class ApplyReconcileUseCase {
  constructor(
    private readonly patients: PatientsService,
    private readonly implants: ImplantRegistryService,
    private readonly ortho: OrthoRegistryService,
  ) {}

  async execute(
    input: { patients?: ApplyEntityDto[]; implants?: ApplyEntityDto[]; ortho?: ApplyEntityDto[] },
    userId: string | null,
  ): Promise<ApplyReconcileResult> {
    return {
      patients: await this.applyPatients(input.patients ?? [], userId),
      implants: await this.applyRegistry(input.implants ?? [], userId, this.implants),
      ortho: await this.applyRegistry(input.ortho ?? [], userId, this.ortho),
    };
  }

  private async applyPatients(
    entities: ApplyEntityDto[],
    userId: string | null,
  ): Promise<ApplyResultRow[]> {
    const results: ApplyResultRow[] = [];
    for (const entity of entities) {
      const dto = await this.buildAndValidate(UpdatePatientDto, entity.fields);
      if (!dto) {
        results.push({ id: entity.id, ok: false, reason: 'validation' });
        continue;
      }
      try {
        await this.patients.update(entity.id, dto, userId);
        results.push({ id: entity.id, ok: true });
      } catch {
        results.push({ id: entity.id, ok: false, reason: 'update-failed' });
      }
    }
    return results;
  }

  private async applyRegistry(
    entities: ApplyEntityDto[],
    userId: string | null,
    service: RegistryUpdatable,
  ): Promise<ApplyResultRow[]> {
    const results: ApplyResultRow[] = [];
    for (const entity of entities) {
      const dto = await this.buildAndValidate(UpdateRegistryCaseDto, entity.fields);
      if (!dto) {
        results.push({ id: entity.id, ok: false, reason: 'validation' });
        continue;
      }
      try {
        await service.update(entity.id, dto, userId);
        results.push({ id: entity.id, ok: true });
      } catch {
        results.push({ id: entity.id, ok: false, reason: 'update-failed' });
      }
    }
    return results;
  }

  /**
   * Mirrors the global `ValidationPipe` (whitelist + forbidNonWhitelisted)
   * from `main.ts` — this DTO is built and consumed inside the process, so it
   * never passes through that pipe on its own.
   */
  private async buildAndValidate<T extends object>(
    cls: new () => T,
    fields: Array<{ field: string; proposed: string | null }>,
  ): Promise<T | null> {
    const raw: Record<string, string | null> = {};
    for (const f of fields) raw[f.field] = f.proposed;

    const dto = plainToInstance(cls, raw, { enableImplicitConversion: false });
    const errors = await validate(dto as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return errors.length ? null : dto;
  }
}
