import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { addMonths } from 'date-fns-jalali';
import { EntityManager, Repository } from 'typeorm';

import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import {
  QuerySurgeryDto,
  UpdateSurgeryDto,
  UpsertSurgeryDto,
} from './dto/surgery.dto';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
import { JalaliDate, storedDate } from '../../domain';
import { loosePersianKey, searchKey } from '../../domain';
import { extractImplantBrand } from '../../domain';
import { DatePrecisionEnum } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { assertMayWriteClinicalNotes } from '../../application/policies/clinical-notes.policy';
import { ErrorCode } from '../../domain';
import { followUpState, followUpWindow, openFollowUpSql } from './follow-up';

/**
 * The list's follow-up switch: an edit that says whether the visit happened
 * and nothing else. It is the one write exempt from the version check — it
 * cannot overwrite another field, so a concurrent edit is no reason to fail.
 */
function isFollowUpToggle(dto: Partial<UpsertSurgeryDto>): boolean {
  const sent = Object.keys(dto).filter(
    (key) => dto[key as keyof UpsertSurgeryDto] !== undefined,
  );
  return sent.length === 1 && sent[0] === 'followUpDoneAt';
}

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
    if (dto.followUp) {
      const { from, to } = followUpWindow(dto.followUp);
      qb.andWhere(openFollowUpSql('s'));
      if (from) qb.andWhere('s."followUpDate" >= :from', { from });
      if (to) qb.andWhere('s."followUpDate" <= :to', { to });
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
    // A follow-up list is read soonest-first whichever way the queue is sorted.
    if (dto.followUp) {
      qb.orderBy('s.followUpDate', 'ASC');
    } else {
      qb.orderBy(
        's.surgeryDate',
        dto.sortDir === 'DESC' ? 'DESC' : 'ASC',
        'NULLS LAST',
      );
    }
    qb.addOrderBy('s.id', 'ASC');
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

  /**
   * The next unused number in the implant book, offered when a row is added
   * so nobody has to look one up — or, as has happened, reach for the
   * patient's file number instead.
   */
  async nextRegistryNo(): Promise<{ registryNo: string }> {
    const row = await this.implants.query<Array<{ max: string | null }>>(
      `SELECT max("registryNo"::bigint)::text AS max FROM implant_cases WHERE "registryNo" ~ '^[0-9]+$'`,
    );
    return { registryNo: String(BigInt(row[0]?.max ?? '0') + 1n) };
  }

  async create(
    dto: UpsertSurgeryDto,
    userId: string | null,
    role?: string,
  ): Promise<unknown> {
    assertMayWriteClinicalNotes(role, [[dto.notes, null]]);
    const id = await this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      const item = queue.create();
      const registered = await this.assign(
        item,
        dto,
        manager.getRepository(ImplantCase),
      );
      const saved = await queue.save(item);
      if (registered) await this.auditRegistered(registered, userId, manager);
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

  /** The implant register entry a surgery row opened on its own behalf. */
  private auditRegistered(
    created: ImplantCase,
    userId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    return this.audit.recordRequired(
      {
        userId,
        action: 'create',
        entity: 'implant_case',
        entityId: created.id,
        changes: {
          registryNo: created.registryNo,
          recordedName: created.recordedName,
          via: 'surgery_queue',
        },
      },
      manager,
    );
  }

  async update(
    id: string,
    { expectedVersion, ...dto }: UpdateSurgeryDto,
    userId: string | null,
    role?: string,
  ): Promise<unknown> {
    await this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      // Lock and read in one, then the version check: a concurrent edit
      // waits here, reads the bumped version and is refused.
      const item = await queue.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
      if (!isFollowUpToggle(dto) && item.version !== expectedVersion) {
        throw AppException.conflict(ErrorCode.SurgeryItemModified);
      }
      assertMayWriteClinicalNotes(role, [[dto.notes, item.notes]]);
      const registered = await this.assign(
        item,
        dto,
        manager.getRepository(ImplantCase),
      );
      await queue.save(item);
      if (registered) await this.auditRegistered(registered, userId, manager);
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
  ): Promise<ImplantCase | null> {
    let registered: ImplantCase | null = null;
    // The number this row carried before the edit: the register may have
    // renumbered its case since, so this copy can be stale (see below).
    const previousRegistryNo = item.implantRegistryNo;
    if (dto.kind !== undefined) item.kind = dto.kind;
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
    if (dto.followUpMonths !== undefined)
      item.followUpMonths = dto.followUpMonths ?? null;
    if (dto.followUpDoneAt !== undefined) {
      item.followUpDoneAt = dto.followUpDoneAt
        ? JalaliDate.parse(dto.followUpDoneAt).date
        : null;
    }
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

    // The follow-up date is derived, never typed: surgery date plus the
    // chosen months on the Jalali calendar (an end-of-month date clamps to
    // the shorter month). Either input changing moves it; either missing
    // clears it.
    item.followUpDate =
      item.surgeryDate && item.followUpMonths
        ? addMonths(storedDate(item.surgeryDate), item.followUpMonths)
        : null;

    // Resolve the implant case: an explicit id wins; an explicit null number
    // unlinks; a number the user actually changed is looked up; anything else
    // keeps the link the row already has.
    //
    // "Changed" is measured against the number this row last carried, not
    // the case's current one. The register can renumber a case (42 → 43)
    // without touching the surgery's copy, and an edit that only fixes the
    // notes sends that copy (42) straight back — looking 42 up would miss,
    // open a fresh unlinked entry under 42 and move the surgery onto it,
    // dropping its patient.
    let implantCase: ImplantCase | null = null;
    const numberChanged =
      dto.implantRegistryNo !== undefined &&
      dto.implantRegistryNo !== previousRegistryNo;
    if (dto.implantCaseId !== undefined) {
      item.implantCaseId = dto.implantCaseId ?? null;
      implantCase = dto.implantCaseId
        ? await implants.findOne({ where: { id: dto.implantCaseId } })
        : null;
    } else if (dto.implantRegistryNo === null) {
      // Cleared on purpose: unlink. Without this the branch below reloaded
      // the old case and wrote its number straight back.
      item.implantCaseId = null;
    } else if (
      dto.implantRegistryNo &&
      (numberChanged || !item.implantCaseId)
    ) {
      implantCase = await implants.findOne({
        where: { registryNo: dto.implantRegistryNo },
      });
      // A number the book does not know yet is a new entry in the book: the
      // list is where a surgery gets written down first, and the register
      // has to grow with it or the two drift apart. The patient link is
      // left for staff to make from the register screen.
      if (!implantCase && item.recordedName) {
        implantCase = await implants.save(
          implants.create({
            registryNo: dto.implantRegistryNo,
            recordedName: item.recordedName,
            patientId: null,
            matchMethod: 'unmatched',
            mobile: null,
            homePhone: null,
            notes: null,
            searchText: searchKey(
              `${dto.implantRegistryNo} ${item.recordedName}`,
            ),
          }),
        );
        registered = implantCase;
      }
      item.implantCaseId = implantCase?.id ?? null;
    } else if (item.implantCaseId) {
      implantCase = await implants.findOne({
        where: { id: item.implantCaseId },
      });
    }

    // A linked row shows its case's number: the case is the source of truth,
    // and this also heals a copy left stale by a renumbering.
    if (implantCase) item.implantRegistryNo = implantCase.registryNo;

    if (implantCase && item.recordedName) {
      const a = loosePersianKey(implantCase.recordedName);
      const b = loosePersianKey(item.recordedName);
      item.hasNameMismatch = Boolean(a && b && a !== b);
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
    return registered;
  }

  private formatDate(
    value: Date | string,
    precision: DatePrecisionEnum | null,
  ): string {
    return JalaliDate.fromStored(value, precision ?? 'day')?.format() ?? '';
  }

  private toResponse(item: SurgeryQueueItem): Record<string, unknown> {
    return {
      id: item.id,
      kind: item.kind,
      implantCaseId: item.implantCaseId,
      // The linked case's number when there is one — it can have been
      // renumbered since this row last saved its copy.
      implantRegistryNo: item.implantCase?.registryNo ?? item.implantRegistryNo,
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
            iso: JalaliDate.fromStored(item.surgeryDate)?.toIsoDate() ?? '',
            precision: item.surgeryDatePrecision ?? 'day',
            raw: item.surgeryDateRaw,
          }
        : null,
      toothPosition: item.toothPosition,
      implantBrand: item.implantBrand,
      abutmentType: item.abutmentType,
      abutmentRaw: item.abutmentRaw,
      prosthesisDue: item.prosthesisDue,
      followUpMonths: item.followUpMonths,
      followUpDate: item.followUpDate
        ? {
            jalali: this.formatDate(item.followUpDate, null),
            iso: JalaliDate.fromStored(item.followUpDate)?.toIsoDate() ?? '',
          }
        : null,
      followUpDoneAt: item.followUpDoneAt
        ? this.formatDate(item.followUpDoneAt, null)
        : null,
      followUpState: followUpState(item),
      status: item.status,
      notes: item.notes,
      /** Optimistic-concurrency token; send back as `expectedVersion` on update. */
      version: item.version,
    };
  }
}
