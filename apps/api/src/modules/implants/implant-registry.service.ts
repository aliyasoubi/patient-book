import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';
import { RegistryService } from '../registries/registry.service';
import { refreshCaseCopies } from '../surgery/case-copy';
import { ImplantCase } from './implant-case.entity';
import { lockImplantFile } from './implant-file-lock';

/**
 * The implant register, as an injectable service.
 *
 * Exists so the controller can depend on an abstraction the container supplies
 * rather than constructing a generic service itself: a controller that calls
 * `new` cannot be given a test double, and silently owns its collaborators'
 * lifecycles. Behaviour comes from {@link RegistryService}; this class binds
 * it to the implant table, keeps the surgery rows filed under a case in step
 * when the case is renumbered or renamed, and keeps one file per patient.
 */
@Injectable()
export class ImplantRegistryService extends RegistryService<ImplantCase> {
  constructor(
    @InjectRepository(ImplantCase) repository: Repository<ImplantCase>,
    audit: AuditService,
  ) {
    super(repository, 'implant_case', audit);
  }

  /**
   * The patient's implant file, opened under the book's next number if they
   * have none — where the stock writes the implants it hands them.
   */
  async fileFor(
    manager: EntityManager,
    patientId: string,
    userId: string | null,
  ): Promise<ImplantCase> {
    return (
      (await this.fileOf(manager, patientId)) ??
      (await this.createIn(manager, { patientId }, userId))
    );
  }

  protected override async afterUpdate(
    manager: EntityManager,
    saved: ImplantCase,
  ): Promise<void> {
    await refreshCaseCopies(manager, [saved.id]);
  }

  /** A patient has one implant file: another is refused, naming the one they have. */
  protected override async assertPatientFree(
    manager: EntityManager,
    patientId: string,
    caseId: string | null,
  ): Promise<void> {
    const file = await this.fileOf(manager, patientId);
    if (file && file.id !== caseId) {
      throw AppException.conflict(ErrorCode.ImplantCaseExists, {
        registryNo: file.registryNo,
      });
    }
  }

  /**
   * The patient's implant file, archived ones aside. Read under a lock on the
   * patient, so two saves for them at once queue and the second sees the
   * file the first opened.
   *
   * A patient linked to two files before they were kept to one gets the
   * first opened, every time. The workbook import opened its files all at
   * one moment, so among those it is the book's lower number.
   */
  private async fileOf(
    manager: EntityManager,
    patientId: string,
  ): Promise<ImplantCase | null> {
    await lockImplantFile(manager, patientId);
    return manager
      .getRepository(ImplantCase)
      .createQueryBuilder('c')
      .where('c."patientId" = :patientId', { patientId })
      .orderBy('c."createdAt"', 'ASC')
      .addOrderBy('length(c."registryNo")', 'ASC')
      .addOrderBy('c."registryNo"', 'ASC')
      .getOne();
  }
}
