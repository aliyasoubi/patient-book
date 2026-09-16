import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { QuerySurgeryDto, UpsertSurgeryDto } from './dto/surgery.dto';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
import { JalaliDate } from '../../domain';
import { loosePersianKey, searchKey } from '../../domain';
import { extractImplantBrand } from '../../domain';
import { DatePrecisionEnum } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';

@Injectable()
export class SurgeryService {
  constructor(
    @InjectRepository(SurgeryQueueItem)
    private readonly queue: Repository<SurgeryQueueItem>,
    @InjectRepository(ImplantCase)
    private readonly implants: Repository<ImplantCase>,
    private readonly audit: AuditService,
  ) {}

  async findAll(dto: QuerySurgeryDto): Promise<PageResult<unknown>> {
    const qb = this.queue
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.implantCase', 'ic')
      .leftJoinAndSelect('ic.patient', 'p')
      .skip(dto.skip)
      .take(dto.limit);

    const key = searchKey(dto.q);
    if (key) {
      for (const [i, word] of key.split(' ').entries()) {
        qb.andWhere(`s."searchText" LIKE :w${i}`, { [`w${i}`]: `%${word}%` });
      }
    }
    if (dto.status) qb.andWhere('s.status = :status', { status: dto.status });
    if (dto.mismatchedOnly) qb.andWhere('s."hasNameMismatch" = true');
    if (dto.archivedOnly) {
      qb.withDeleted().andWhere('s."deletedAt" IS NOT NULL');
    }
    if (dto.from) {
      const from = JalaliDate.tryParse(dto.from);
      if (from instanceof JalaliDate) {
        qb.andWhere('s."surgeryDate" >= :from', { from: from.toIsoDate() });
      }
    }
    if (dto.to) {
      const to = JalaliDate.tryParse(dto.to);
      if (to instanceof JalaliDate) {
        qb.andWhere('s."surgeryDate" <= :to', { to: to.toIsoDate() });
      }
    }

    // Property path, not raw SQL: combining take/skip with a join makes
    // TypeORM wrap the query, and it mangles a quoted identifier when it does.
    qb.orderBy(
      's.surgeryDate',
      dto.sortDir === 'DESC' ? 'DESC' : 'ASC',
      'NULLS LAST',
    ).addOrderBy('s.id', 'ASC');
    const [items, total] = await qb.getManyAndCount();
    return PageResult.of(
      items.map((i) => this.toResponse(i)),
      total,
      dto,
    );
  }

  async findOne(id: string): Promise<unknown> {
    const item = await this.queue.findOne({
      where: { id },
      relations: { implantCase: { patient: true } },
    });
    if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
    return this.toResponse(item);
  }

  async create(dto: UpsertSurgeryDto, userId: string | null): Promise<unknown> {
    const id = await this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      const item = queue.create();
      await this.assign(item, dto, manager.getRepository(ImplantCase));
      const saved = await queue.save(item);
      await this.audit.recordRequired(
        {
          userId,
          action: 'create',
          entity: 'surgery_queue',
          entityId: saved.id,
          changes: {
            recordedName: saved.recordedName,
            registryNo: saved.implantRegistryNo,
          },
        },
        manager,
      );
      return saved.id;
    });
    return this.findOne(id);
  }

  async update(
    id: string,
    dto: Partial<UpsertSurgeryDto>,
    userId: string | null,
  ): Promise<unknown> {
    await this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      const item = await queue.findOne({ where: { id } });
      if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
      await this.assign(item, dto, manager.getRepository(ImplantCase));
      await queue.save(item);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'surgery_queue',
          entityId: id,
          changes: dto,
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  async remove(id: string, userId: string | null): Promise<void> {
    await this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      const item = await queue.findOne({ where: { id } });
      if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
      await queue.softDelete(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'delete',
          entity: 'surgery_queue',
          entityId: id,
          changes: { recordedName: item.recordedName },
        },
        manager,
      );
    });
  }

  async restore(id: string, userId: string | null): Promise<unknown> {
    await this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      const item = await queue.findOne({ where: { id }, withDeleted: true });
      if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
      await queue.restore(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'restore',
          entity: 'surgery_queue',
          entityId: id,
          changes: { recordedName: item.recordedName },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * Apply an update, re-deriving the fields that depend on other fields: the
   * implant brand parsed out of the tooth phrase, and the name-mismatch flag
   * that warns when a reused register number points at a different person.
   */
  private async assign(
    item: SurgeryQueueItem,
    dto: Partial<UpsertSurgeryDto>,
    implants: Repository<ImplantCase> = this.implants,
  ): Promise<void> {
    if (dto.recordedName !== undefined)
      item.recordedName = dto.recordedName ?? '';
    if (dto.toothPosition !== undefined) {
      item.toothPosition = dto.toothPosition ?? '';
      // Legacy rows only ever had a brand baked into this phrase; once a row
      // has an explicit one, editing the tooth position must not clobber it.
      if (!item.implantBrand) {
        item.implantBrand = extractImplantBrand(item.toothPosition);
      }
    }
    if (dto.implantBrand !== undefined)
      item.implantBrand = dto.implantBrand ?? null;
    if (dto.abutmentType !== undefined) item.abutmentType = dto.abutmentType;
    if (dto.prosthesisDue !== undefined)
      item.prosthesisDue = dto.prosthesisDue ?? null;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.notes !== undefined) item.notes = dto.notes ?? null;
    if (dto.implantRegistryNo !== undefined)
      item.implantRegistryNo = dto.implantRegistryNo ?? null;

    if (dto.surgeryDate !== undefined) {
      if (!dto.surgeryDate) {
        item.surgeryDate = null;
        item.surgeryDateRaw = null;
        item.surgeryDatePrecision = null;
      } else {
        // Throws a DomainError the filter turns into a 400 with a field code.
        const parsed = JalaliDate.parse(dto.surgeryDate);
        item.surgeryDate = parsed.date;
        item.surgeryDateRaw = parsed.format();
        item.surgeryDatePrecision = parsed.precision as DatePrecisionEnum;
      }
    }

    // Resolve the implant case: an explicit id wins, otherwise look the
    // register number up.
    let implantCase: ImplantCase | null = null;
    if (dto.implantCaseId !== undefined) {
      item.implantCaseId = dto.implantCaseId ?? null;
      implantCase = dto.implantCaseId
        ? await implants.findOne({ where: { id: dto.implantCaseId } })
        : null;
    } else if (dto.implantRegistryNo) {
      implantCase = await implants.findOne({
        where: { registryNo: dto.implantRegistryNo },
      });
      item.implantCaseId = implantCase?.id ?? null;
    } else if (item.implantCaseId) {
      implantCase = await implants.findOne({
        where: { id: item.implantCaseId },
      });
    }

    if (implantCase && item.recordedName) {
      const a = loosePersianKey(implantCase.recordedName);
      const b = loosePersianKey(item.recordedName);
      item.hasNameMismatch = Boolean(a && b && a !== b);
      if (!item.implantRegistryNo)
        item.implantRegistryNo = implantCase.registryNo;
    } else {
      item.hasNameMismatch = false;
    }

    item.searchText = searchKey(
      [
        item.implantRegistryNo,
        item.recordedName,
        item.toothPosition,
        item.implantBrand,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  private formatDate(
    value: Date | string,
    precision: DatePrecisionEnum | null,
  ): string {
    return (
      JalaliDate.fromDate(new Date(value), precision ?? 'day')?.format() ?? ''
    );
  }

  private toResponse(item: SurgeryQueueItem): Record<string, unknown> {
    return {
      id: item.id,
      implantCaseId: item.implantCaseId,
      implantRegistryNo: item.implantRegistryNo,
      recordedName: item.recordedName,
      hasNameMismatch: item.hasNameMismatch,
      registeredName: item.implantCase?.recordedName ?? null,
      patient: item.implantCase?.patient
        ? {
            id: item.implantCase.patient.id,
            fileNo: item.implantCase.patient.fileNo,
            fullName:
              `${item.implantCase.patient.firstName} ${item.implantCase.patient.lastName}`.trim(),
            mobile: item.implantCase.patient.mobile,
          }
        : null,
      surgeryDate: item.surgeryDate
        ? {
            jalali: this.formatDate(
              item.surgeryDate,
              item.surgeryDatePrecision,
            ),
            iso:
              JalaliDate.fromDate(new Date(item.surgeryDate))?.toIsoDate() ??
              '',
            precision: item.surgeryDatePrecision ?? 'day',
            raw: item.surgeryDateRaw,
          }
        : null,
      toothPosition: item.toothPosition,
      implantBrand: item.implantBrand,
      abutmentType: item.abutmentType,
      abutmentRaw: item.abutmentRaw,
      prosthesisDue: item.prosthesisDue,
      status: item.status,
      notes: item.notes,
    };
  }
}
