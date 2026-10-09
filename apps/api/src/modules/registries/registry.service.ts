import { Injectable } from '@nestjs/common';
import { EntityManager, Repository, ObjectLiteral } from 'typeorm';

import { PageResult } from '../../presentation/http/dto/pagination.dto';
import {
  QueryRegistryDto,
  UpdateRegistryCaseDto,
  UpsertRegistryCaseDto,
} from './registry.dto';
import { searchKey } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';
import { Patient } from '../patients/patient.entity';

/** Fields every register row shares — implant and ortho differ only in table. */
export interface RegistryCase extends ObjectLiteral {
  id: string;
  registryNo: string;
  patientId: string | null;
  recordedName: string;
  matchMethod: 'exact' | 'fuzzy' | 'manual' | 'unmatched';
  mobile: string | null;
  homePhone: string | null;
  notes: string | null;
  searchText: string;
  version: number;
}

/**
 * Shared behaviour for the implant and orthodontic registers.
 *
 * Both keep numbering that is independent of the main patient file, so neither
 * `registryNo` is ever treated as a patient key: the link to a patient is an
 * explicit, nullable association a human can correct.
 */
@Injectable()
export class RegistryService<T extends RegistryCase> {
  constructor(
    private readonly repo: Repository<T>,
    private readonly entityName: string,
    private readonly audit: AuditService,
  ) {}

  async findAll(dto: QueryRegistryDto): Promise<PageResult<T>> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.patient', 'p')
      .skip(dto.skip)
      .take(dto.limit);

    const key = searchKey(dto.q);
    if (key) {
      for (const [i, word] of key.split(' ').entries()) {
        qb.andWhere(`c."searchText" LIKE :w${i}`, { [`w${i}`]: `%${word}%` });
      }
    }
    if (dto.status) qb.andWhere('c.status = :status', { status: dto.status });
    if (dto.unlinkedOnly) qb.andWhere('c."patientId" IS NULL');
    if (dto.archivedOnly) {
      qb.withDeleted().andWhere('c."deletedAt" IS NOT NULL');
    }

    const sortable: Record<string, string> = {
      registryNo: 'c.registryNo',
      recordedName: 'c.recordedName',
      createdAt: 'c.createdAt',
    };
    // `hasOwn` rather than a nullish fallback: inherited members such as
    // `constructor` resolve to functions, which `??` would happily keep.
    const requested = dto.sortBy ?? 'registryNo';
    const column = Object.hasOwn(sortable, requested)
      ? sortable[requested]
      : sortable.registryNo;

    if (column === sortable.registryNo) {
      // Register numbers are digit strings; sort them numerically so 9 comes
      // before 10. The expression is exposed as a select alias because
      // TypeORM's paginated-join rewrite mangles a raw ORDER BY expression.
      qb.addSelect(
        `NULLIF(regexp_replace(c."registryNo", '\\D', '', 'g'), '')::bigint`,
        'registry_num',
      ).orderBy('registry_num', dto.sortDir);
    } else {
      qb.orderBy(column, dto.sortDir);
    }
    qb.addOrderBy('c.id', 'ASC');

    const [items, total] = await qb.getManyAndCount();
    return PageResult.of(items, total, dto);
  }

  async findOne(id: string): Promise<T> {
    return this.findOneFrom(this.repo, id);
  }

  private async findOneFrom(
    repository: Repository<T>,
    id: string,
    withDeleted = false,
  ): Promise<T> {
    const row = await repository.findOne({
      where: { id } as never,
      relations: { patient: true } as never,
      withDeleted,
    });
    if (!row) throw AppException.notFound(ErrorCode.RegistryCaseNotFound);
    return row;
  }

  /**
   * Opens a case. Number and name are both optional: opened from a patient's
   * page, nobody should have to look up the book's next number or retype a
   * name the main book already holds, so a missing number is the next unused
   * one and a missing name is the linked patient's.
   */
  async create(dto: UpsertRegistryCaseDto, userId: string | null): Promise<T> {
    return this.repo.manager.transaction((manager) =>
      this.createIn(manager, dto, userId),
    );
  }

  /** {@link create}, inside a transaction someone else runs. */
  async createIn(
    manager: EntityManager,
    dto: UpsertRegistryCaseDto,
    userId: string | null,
  ): Promise<T> {
    const repository = manager.getRepository(this.repo.target);
    const registryNo =
      dto.registryNo ?? (await this.nextRegistryNo(manager, repository));
    if (dto.registryNo) {
      const clash = await repository.findOne({
        where: { registryNo } as never,
      });
      if (clash) {
        throw AppException.conflict(ErrorCode.RegistryNumberTaken, {
          registryNo,
        });
      }
    }
    let recordedName = dto.recordedName;
    if (!recordedName && dto.patientId) {
      const patient = await manager.findOne(Patient, {
        where: { id: dto.patientId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);
      recordedName = `${patient.firstName} ${patient.lastName}`.trim();
    }
    const entity = repository.create({
      ...dto,
      registryNo,
      recordedName: recordedName ?? '',
    } as never) as unknown as T;
    entity.matchMethod = dto.patientId ? 'manual' : 'unmatched';
    entity.searchText = this.buildSearch(entity);

    const saved = (await repository.save(entity as never)) as unknown as T;
    await this.audit.recordRequired(
      {
        userId,
        action: 'create',
        entity: this.entityName,
        entityId: saved.id,
        changes: {
          registryNo: saved.registryNo,
          recordedName: saved.recordedName,
        },
      },
      manager,
    );
    return saved;
  }

  async update(
    id: string,
    { expectedVersion, ...dto }: UpdateRegistryCaseDto,
    userId: string | null,
  ): Promise<T> {
    return this.repo.manager.transaction(async (manager) => {
      const repository = manager.getRepository(this.repo.target);
      // Lock and read in one: a concurrent edit waits here, then reads the
      // bumped version and is refused — check and write are atomic, not
      // just adjacent. Read without the `patient` relation: TypeORM would
      // persist a loaded relation over a changed `patientId`, so a relink
      // would be audited and marked manual yet never stored.
      const existing = await repository.findOne({
        where: { id } as never,
        lock: { mode: 'pessimistic_write' },
      });
      if (!existing)
        throw AppException.notFound(ErrorCode.RegistryCaseNotFound);
      if (existing.version !== expectedVersion) {
        throw AppException.conflict(ErrorCode.RegistryCaseModified);
      }

      if (dto.registryNo && dto.registryNo !== existing.registryNo) {
        const clash = await repository.findOne({
          where: { registryNo: dto.registryNo } as never,
        });
        if (clash) {
          throw AppException.conflict(ErrorCode.RegistryNumberTaken, {
            registryNo: dto.registryNo,
          });
        }
      }
      Object.assign(existing, dto);
      // A human editing the link makes it authoritative.
      if (dto.patientId !== undefined) {
        existing.matchMethod = dto.patientId ? 'manual' : 'unmatched';
      }
      existing.searchText = this.buildSearch(existing);

      await repository.save(existing as never);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: this.entityName,
          entityId: id,
          changes: dto,
        },
        manager,
      );
      // Re-read for the response, so it carries the patient now linked.
      return this.findOneFrom(repository, id);
    });
  }

  async remove(id: string, userId: string | null): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const repository = manager.getRepository(this.repo.target);
      const existing = await this.findOneFrom(repository, id);
      await repository.softDelete(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'delete',
          entity: this.entityName,
          entityId: id,
          changes: { registryNo: existing.registryNo },
        },
        manager,
      );
    });
  }

  async restore(id: string, userId: string | null): Promise<T> {
    await this.repo.manager.transaction(async (manager) => {
      const repository = manager.getRepository(this.repo.target);
      const existing = await this.findOneFrom(repository, id, true);
      await repository.restore(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'restore',
          entity: this.entityName,
          entityId: id,
          changes: { registryNo: existing.registryNo },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * One past the highest numeric number in this book, archived rows included
   * so a restore can never collide. The transaction-scoped advisory lock
   * queues concurrent creates here, so two cannot be handed the same number.
   */
  private async nextRegistryNo(
    manager: EntityManager,
    repository: Repository<T>,
  ): Promise<string> {
    const table = repository.metadata.tableName;
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `registry_no:${table}`,
    ]);
    const rows = await manager.query<Array<{ max: string | null }>>(
      `SELECT max("registryNo"::bigint)::text AS max FROM "${table}" WHERE "registryNo" ~ '^[0-9]+$'`,
    );
    return String(BigInt(rows[0]?.max ?? '0') + 1n);
  }

  private buildSearch(c: RegistryCase): string {
    return searchKey(
      [c.registryNo, c.recordedName, c.mobile, c.homePhone]
        .filter(Boolean)
        .join(' '),
    );
  }
}
