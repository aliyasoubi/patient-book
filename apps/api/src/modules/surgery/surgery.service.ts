import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { addDays, addMonths, format as formatJalali } from 'date-fns-jalali';
import { EntityManager, In, Repository } from 'typeorm';

import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { FollowUpContact } from './follow-up-contact.entity';
import { namesDiffer, surgerySearchText } from './case-copy';
import { ImplantCase } from '../implants/implant-case.entity';
import { lockImplantFile } from '../implants/implant-file-lock';
import type { InventoryMovement } from '../inventory/inventory-movement.entity';
import { Patient } from '../patients/patient.entity';
import {
  QuerySurgeryDto,
  RecordContactDto,
  UpdateSurgeryDto,
  UpsertSurgeryDto,
} from './dto/surgery.dto';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
import { JalaliDate, storedDate } from '../../domain';
import { searchKey } from '../../domain';
import { extractImplantBrand } from '../../domain';
import { DatePrecisionEnum } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { assertMayWriteClinicalNotes } from '../../application/policies/clinical-notes.policy';
import {
  ContactOutcome,
  ErrorCode,
  FollowUpStatus,
  InventoryCategory,
  InventoryMovementKind,
  SurgeryKind,
  SurgeryStatus,
} from '../../domain';
import {
  callsTodayBounds,
  callsTodaySql,
  followUpState,
  followUpWindow,
  openFollowUpSql,
  settledStatusOf,
} from './follow-up';

/**
 * The card's follow-up status: an edit that says where the follow-up stands
 * with the patient — and, when booked, which day — and nothing else. It is
 * the one write exempt from the version check: it cannot overwrite another
 * field, so a concurrent edit is no reason to fail.
 */
function isFollowUpChange(dto: Partial<UpsertSurgeryDto>): boolean {
  const sent = Object.keys(dto).filter(
    (key) => dto[key as keyof UpsertSurgeryDto] !== undefined,
  );
  return (
    sent.length > 0 &&
    sent.every((key) =>
      ['followUpStatus', 'followUpAppointmentAt'].includes(key),
    )
  );
}

/** `text` with the parts of `more` it does not already have appended. */
function joinNew(
  text: string | null,
  more: string | null | undefined,
  separator: string,
): string {
  const have = new Set(text ? text.split(separator) : []);
  const added = (more ? more.split(separator) : []).filter(
    (part) => part && !have.has(part),
  );
  return [...(text ? [text] : []), ...added].join(separator);
}

/** The FDI numbers a stock card line names («36 37»). */
function teethOf(tooth: string | null): number[] {
  return (tooth?.match(/\d+/g) ?? []).map(Number);
}

/**
 * One implant from the stock filed under a row: the teeth it went into, the
 * box — item, system, size and lot — how many, and what the use said.
 */
export interface PlacedImplant {
  teeth: number[];
  name: string;
  brand: string | null;
  spec: string | null;
  lotNumber: string | null;
  quantity: number;
  note: string | null;
}

@Injectable()
export class SurgeryService {
  constructor(
    @InjectRepository(SurgeryQueueItem)
    private readonly queue: Repository<SurgeryQueueItem>,
    @InjectRepository(ImplantCase)
    private readonly implants: Repository<ImplantCase>,
    @InjectRepository(FollowUpContact)
    private readonly contactRows: Repository<FollowUpContact>,
    private readonly audit: AuditService,
  ) {}

  async findAll(dto: QuerySurgeryDto): Promise<PageResult<unknown>> {
    const qb = this.queue
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.implantCase', 'ic')
      .leftJoinAndSelect('s.patient', 'p')
      .skip(dto.skip)
      .take(dto.limit);

    const key = searchKey(dto.q);
    if (key) {
      const words = key.split(' ');
      // A number on its own may be the patient's file number or mobile,
      // which the row's own text does not hold.
      const number = words.length === 1 && /^\d+$/.test(key) ? key : null;
      for (const [i, word] of words.entries()) {
        const text = `s."searchText" LIKE :w${i}`;
        qb.andWhere(
          number ? `(${text} OR p."fileNo" = :n OR p.mobile = :n)` : text,
          { [`w${i}`]: `%${word}%`, ...(number ? { n: number } : {}) },
        );
      }
    }
    if (dto.patientId) {
      qb.andWhere('s."patientId" = :patientId', { patientId: dto.patientId });
    }
    if (dto.unlinkedOnly) qb.andWhere('s."patientId" IS NULL');
    if (dto.status) qb.andWhere('s.status = :status', { status: dto.status });
    if (dto.mismatchedOnly) qb.andWhere('s."hasNameMismatch" = true');
    if (dto.archivedOnly) {
      qb.withDeleted().andWhere('s."deletedAt" IS NOT NULL');
    }
    if (dto.followUp === 'callsToday') {
      const { today, monthEnd } = callsTodayBounds();
      qb.andWhere(callsTodaySql('s', ':today', ':monthEnd'), {
        today,
        monthEnd,
      });
    } else if (dto.followUp) {
      const settled = settledStatusOf(dto.followUp);
      if (settled) {
        qb.andWhere('s."followUpDate" IS NOT NULL')
          .andWhere('s."followUpStatus" = :settled', { settled })
          .andWhere('s.status <> :cancelled', {
            cancelled: SurgeryStatus.Cancelled,
          });
      } else {
        const { from, to } = followUpWindow(dto.followUp);
        qb.andWhere(openFollowUpSql('s'));
        if (from) qb.andWhere('s."followUpDate" >= :from', { from });
        if (to) qb.andWhere('s."followUpDate" <= :to', { to });
      }
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
    // The list is the work to do: follow-ups still open come first, soonest
    // first (the enum sorts open, booked, declined, so the status does it),
    // then the settled ones. Rows with no follow-up date, and the settled
    // ones among themselves, fall back to the surgery date.
    qb.orderBy('s.followUpStatus', 'ASC')
      .addOrderBy('s.followUpDate', 'ASC', 'NULLS LAST')
      .addOrderBy(
        's.surgeryDate',
        dto.sortDir === 'DESC' ? 'DESC' : 'ASC',
        'NULLS LAST',
      );
    qb.addOrderBy('s.id', 'ASC');
    const [items, total] = await qb.getManyAndCount();
    const ids = items.map((i) => i.id);
    const last = await this.lastContacts(this.queue.manager, ids);
    const implants = await this.implantsFiled(this.queue.manager, ids);
    return PageResult.of(
      items.map((i) =>
        this.toResponse(i, last.get(i.id) ?? null, implants.get(i.id) ?? []),
      ),
      total,
      dto,
    );
  }

  /** Read through `manager` to see the row as a transaction holding its lock does. */
  async findOne(
    id: string,
    manager: EntityManager = this.queue.manager,
  ): Promise<unknown> {
    const item = await manager.getRepository(SurgeryQueueItem).findOne({
      where: { id },
      relations: { implantCase: true, patient: true },
    });
    if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
    const last = await this.lastContacts(manager, [id]);
    const implants = await this.implantsFiled(manager, [id]);
    return this.toResponse(item, last.get(id) ?? null, implants.get(id) ?? []);
  }

  /** The calls made about a follow-up, newest first, with who made each. */
  async contacts(id: string): Promise<unknown[]> {
    const exists = await this.queue.exists({
      where: { id },
      withDeleted: true,
    });
    if (!exists) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
    const rows = await this.contactRows.find({
      where: { surgeryId: id },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((c) => this.contactResponse(c, c.user));
  }

  /**
   * One call and what it came to. "Booked" and "declined" settle the
   * follow-up as the card's status would, and clear the next call; the other
   * two leave it as it stands, with the day to call again. Like the card's
   * status it needs no version: it overwrites nothing anyone else edits.
   */
  async recordContact(
    id: string,
    dto: RecordContactDto,
    userId: string | null,
  ): Promise<unknown> {
    return this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      const item = await queue.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);

      const settles =
        dto.outcome === ContactOutcome.Booked ||
        dto.outcome === ContactOutcome.Declined;
      if (settles) {
        await this.assign(
          item,
          {
            followUpStatus:
              dto.outcome === ContactOutcome.Booked
                ? FollowUpStatus.Booked
                : FollowUpStatus.Declined,
            followUpAppointmentAt:
              dto.outcome === ContactOutcome.Booked
                ? (dto.appointmentAt ?? null)
                : null,
          },
          manager.getRepository(ImplantCase),
        );
      }
      item.nextContactAt =
        !settles && dto.nextContactAt
          ? JalaliDate.parse(dto.nextContactAt).date
          : null;
      await queue.save(item);

      const contact = await manager.getRepository(FollowUpContact).save(
        manager.getRepository(FollowUpContact).create({
          surgeryId: id,
          outcome: dto.outcome,
          note: dto.note ?? null,
          nextContactAt: item.nextContactAt,
          userId,
        }),
      );
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'surgery_queue',
          entityId: id,
          changes: {
            contact: dto.outcome,
            ...(dto.note ? { note: dto.note } : {}),
            ...(item.nextContactAt ? { nextContactAt: dto.nextContactAt } : {}),
            ...(contact.outcome === ContactOutcome.Booked
              ? { followUpAppointmentAt: dto.appointmentAt ?? null }
              : {}),
          },
        },
        manager,
      );
      // Read before the lock goes, as an edit's answer is.
      return this.findOne(id, manager);
    });
  }

  /** The latest call about each of `ids`, for the cards. */
  private async lastContacts(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    if (!ids.length) return new Map();
    const rows = await manager.query<
      Array<{
        surgeryId: string;
        outcome: ContactOutcome;
        note: string | null;
        nextContactAt: Date | string | null;
        createdAt: Date;
        fullName: string | null;
        username: string | null;
      }>
    >(
      `SELECT DISTINCT ON (c."surgeryId")
              c."surgeryId", c.outcome, c.note, c."nextContactAt", c."createdAt",
              u."fullName", u.username
         FROM follow_up_contacts c
         LEFT JOIN users u ON u.id = c."userId"
        WHERE c."surgeryId" = ANY($1::uuid[])
        ORDER BY c."surgeryId", c."createdAt" DESC`,
      [ids],
    );
    return new Map(
      rows.map((r) => [
        r.surgeryId,
        this.contactResponse(r, { fullName: r.fullName, username: r.username }),
      ]),
    );
  }

  private contactResponse(
    c: {
      outcome: ContactOutcome;
      note: string | null;
      nextContactAt: Date | string | null;
      createdAt: Date;
    },
    user: { fullName: string | null; username: string | null } | null,
  ): Record<string, unknown> {
    return {
      outcome: c.outcome,
      note: c.note,
      nextContactAt: c.nextContactAt
        ? this.formatDate(c.nextContactAt, null)
        : null,
      by: user?.fullName?.trim() || user?.username || null,
      at: formatJalali(new Date(c.createdAt), 'yyyy/MM/dd HH:mm'),
    };
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
    const id = await this.queue.manager.transaction(
      async (manager) => (await this.createIn(manager, dto, userId)).id,
    );
    return this.findOne(id);
  }

  /**
   * A new row inside a transaction someone else runs — the stock writes one
   * for each implant it hands out, in the same transaction as the use, and
   * names the stock card line it came from.
   */
  async createIn(
    manager: EntityManager,
    dto: UpsertSurgeryDto,
    userId: string | null,
    inventoryMovementId: string | null = null,
  ): Promise<SurgeryQueueItem> {
    const queue = manager.getRepository(SurgeryQueueItem);
    const item = queue.create({ inventoryMovementId });
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
          patientId: saved.patientId,
          ...(inventoryMovementId ? { inventoryMovementId } : {}),
        },
      },
      manager,
    );
    return saved;
  }

  /**
   * Implants out of the stock for a patient. The day's implants are one
   * surgery and one follow-up, however many uses they took: the day's row —
   * the stock's, or one written by hand — takes the new teeth, and only a
   * day without one gets a new row, naming the stock card line it came from.
   * The boxes are not written on the row: the use's lines name it, and the
   * row lists them (`implantsFiled`). Runs under the lock the patient's
   * implant file takes, so two uses at once queue and the second finds the
   * first's row.
   */
  async placeFromStock(
    manager: EntityManager,
    dto: UpsertSurgeryDto,
    userId: string | null,
    inventoryMovementId: string,
  ): Promise<SurgeryQueueItem> {
    const queue = manager.getRepository(SurgeryQueueItem);
    const day = await queue
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s."implantCaseId" = :caseId', { caseId: dto.implantCaseId })
      .andWhere('s.kind = :kind', { kind: SurgeryKind.Implant })
      .andWhere('s."surgeryDate" = :date', {
        date: JalaliDate.parse(dto.surgeryDate ?? '').toIsoDate(),
      })
      .andWhere('s.status <> :cancelled', {
        cancelled: SurgeryStatus.Cancelled,
      })
      .orderBy('s.createdAt', 'ASC')
      .getOne();
    if (!day) return this.createIn(manager, dto, userId, inventoryMovementId);

    const changes = {
      teethFdi: [...new Set([...day.teethFdi, ...(dto.teethFdi ?? [])])],
      toothPosition: joinNew(day.toothPosition, dto.toothPosition, ' '),
    };
    await this.assign(day, changes, manager.getRepository(ImplantCase));
    const saved = await queue.save(day);
    await this.audit.recordRequired(
      {
        userId,
        action: 'update',
        entity: 'surgery_queue',
        entityId: saved.id,
        changes: { ...changes, inventoryMovementId },
      },
      manager,
    );
    return saved;
  }

  /**
   * What a use of the stock put on the follow-ups, taken back with it: the
   * implant did not go in after all. Its lines leave the row's list of
   * implants with them. A row the stock wrote loses the use's teeth — those
   * no implant still filed under it names — and is archived once none
   * stands on it, with the implant file opened alongside it when nothing
   * else is filed there; while one stands, the row names that use's line
   * instead. A row written by hand keeps its own teeth. Archived, not
   * erased, so a row someone has since filled in can still be restored.
   */
  async withdrawStockRows(
    manager: EntityManager,
    lines: InventoryMovement[],
    userId: string | null,
  ): Promise<number> {
    if (!lines.length) return 0;
    const undone = lines.map((l) => l.id);
    const filed = [
      ...new Set(lines.flatMap((l) => (l.surgeryId ? [l.surgeryId] : []))),
    ];
    const queue = manager.getRepository(SurgeryQueueItem);
    const rows = await queue.find({
      where: [
        { inventoryMovementId: In(undone) },
        ...(filed.length ? [{ id: In(filed) }] : []),
      ],
    });
    let withdrawn = 0;
    for (const row of rows) {
      const remaining = await this.usesFiledUnder(manager, row.id, undone);
      const changes: Partial<UpsertSurgeryDto> = {};
      let standing: string | null = null;
      if (row.inventoryMovementId && undone.includes(row.inventoryMovementId)) {
        // Lines from before uses named their row stand on it by their day.
        standing =
          remaining[0]?.id ?? (await this.standingUse(manager, row, undone));
        if (!standing) {
          withdrawn++;
          await queue.softDelete(row.id);
          await this.audit.recordRequired(
            {
              userId,
              action: 'delete',
              entity: 'surgery_queue',
              entityId: row.id,
              changes: {
                recordedName: row.recordedName,
                inventoryMovementId: row.inventoryMovementId,
              },
            },
            manager,
          );
          await this.withdrawOpenedFile(manager, row, userId);
          continue;
        }
        row.inventoryMovementId = standing;
      }
      if (row.inventoryMovementId) {
        const named = new Set(remaining.flatMap((use) => teethOf(use.tooth)));
        const gone = new Set(
          lines
            .filter((l) => l.surgeryId === row.id)
            .flatMap((l) => teethOf(l.tooth))
            .filter((tooth) => !named.has(tooth)),
        );
        if (gone.size) {
          changes.teethFdi = row.teethFdi.filter((t) => !gone.has(t));
          changes.toothPosition = row.toothPosition
            .split(' ')
            .filter((part) => !gone.has(Number(part)))
            .join(' ');
          await this.assign(row, changes, manager.getRepository(ImplantCase));
        }
      }
      if (!standing && !Object.keys(changes).length) continue;
      await queue.save(row);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'surgery_queue',
          entityId: row.id,
          changes: {
            ...changes,
            ...(standing ? { inventoryMovementId: standing } : {}),
          },
        },
        manager,
      );
    }
    return withdrawn;
  }

  /** The uses filed under a row, other than the lines being taken back. */
  private usesFiledUnder(
    manager: EntityManager,
    rowId: string,
    undone: string[],
  ): Promise<Array<{ id: string; tooth: string | null }>> {
    return manager.query(
      `SELECT id, tooth FROM inventory_movements
        WHERE "surgeryId" = $1 AND kind = $2 AND id <> ALL($3::uuid[])
        ORDER BY seq`,
      [rowId, InventoryMovementKind.Use, undone],
    );
  }

  /**
   * The implant file the stock opened along with `row` — in the same
   * transaction, so at the same moment — archived with it when nothing else
   * is filed there: a use for the wrong patient, taken back, leaves them no
   * file. A file opened any other way, or holding anything else, stays.
   */
  private async withdrawOpenedFile(
    manager: EntityManager,
    row: SurgeryQueueItem,
    userId: string | null,
  ): Promise<void> {
    if (!row.implantCaseId) return;
    // Compared in SQL: a JS date keeps only milliseconds.
    const [file] = await manager.query<
      Array<{ id: string; registryNo: string }>
    >(
      `SELECT c.id, c."registryNo" FROM implant_cases c
         JOIN surgery_queue s ON s.id = $2 AND s."createdAt" = c."createdAt"
        WHERE c.id = $1 AND c."deletedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM surgery_queue o
                           WHERE o."implantCaseId" = c.id AND o."deletedAt" IS NULL)`,
      [row.implantCaseId, row.id],
    );
    if (!file) return;
    await manager.getRepository(ImplantCase).softDelete(file.id);
    await this.audit.recordRequired(
      {
        userId,
        action: 'delete',
        entity: 'implant_case',
        entityId: file.id,
        changes: { registryNo: file.registryNo, via: 'inventory_undo' },
      },
      manager,
    );
  }

  /**
   * The implants from the stock filed under each of `rowIds`, in the order
   * they were used. Read from the stock card, so an undo — which takes its
   * lines off the card — takes them off the list too.
   */
  private async implantsFiled(
    manager: EntityManager,
    rowIds: string[],
  ): Promise<Map<string, PlacedImplant[]>> {
    const filed = new Map<string, PlacedImplant[]>();
    if (!rowIds.length) return filed;
    const lines = await manager.query<
      Array<{
        surgeryId: string;
        tooth: string | null;
        change: number;
        note: string | null;
        lotNumber: string | null;
        name: string;
        brand: string | null;
        spec: string | null;
      }>
    >(
      `SELECT m."surgeryId", m.tooth, m.change, m.note, l."lotNumber",
              i.name, i.brand, i.spec
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m."itemId"
         LEFT JOIN inventory_lots l ON l.id = m."lotId"
        WHERE m."surgeryId" = ANY($1::uuid[]) AND m.kind = $2
        ORDER BY m.seq`,
      [rowIds, InventoryMovementKind.Use],
    );
    for (const line of lines) {
      const list = filed.get(line.surgeryId) ?? [];
      list.push({
        teeth: teethOf(line.tooth),
        name: line.name,
        brand: line.brand,
        spec: line.spec,
        lotNumber: line.lotNumber,
        quantity: -line.change,
        note: line.note,
      });
      filed.set(line.surgeryId, list);
    }
    return filed;
  }

  /**
   * An implant use for the row's patient on the row's day, other than the
   * lines being taken back: one that joined the row and still stands.
   */
  private async standingUse(
    manager: EntityManager,
    row: SurgeryQueueItem,
    undone: string[],
  ): Promise<string | null> {
    if (!row.implantCaseId || !row.surgeryDate) return null;
    // Local midnight, and the clinic's day: the process runs in its zone.
    const day = storedDate(row.surgeryDate);
    const [line] = await manager.query<Array<{ id: string }>>(
      `SELECT m.id FROM inventory_movements m
         JOIN inventory_items i ON i.id = m."itemId"
         JOIN implant_cases c ON c."patientId" = m."patientId"
        WHERE c.id = $1 AND m.kind = $2 AND i.category = $3
          AND m."createdAt" >= $4 AND m."createdAt" < $5
          AND m.id <> ALL($6::uuid[])
        ORDER BY m.seq
        LIMIT 1`,
      [
        row.implantCaseId,
        InventoryMovementKind.Use,
        InventoryCategory.Implant,
        day,
        addDays(day, 1),
        undone,
      ],
    );
    return line?.id ?? null;
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
    return this.queue.manager.transaction(async (manager) => {
      const queue = manager.getRepository(SurgeryQueueItem);
      // Lock and read in one, then the version check: a concurrent edit
      // waits here, reads the bumped version and is refused. A follow-up
      // status alone needs no version, but one sent is checked: that is an
      // Undo, which must not put back a status over someone's newer one.
      const item = await queue.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw AppException.notFound(ErrorCode.SurgeryItemNotFound);
      const versioned = expectedVersion !== undefined || !isFollowUpChange(dto);
      if (versioned && item.version !== expectedVersion) {
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
      // Read before the lock goes: the version an Undo carries is this save's own.
      return this.findOne(id, manager);
    });
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
    // The patient picked on the form, or unlinked there. The relation is
    // never loaded on a write path, so the id alone is what save() writes.
    if (dto.patientId !== undefined && dto.patientId !== item.patientId) {
      if (dto.patientId) {
        const exists = await implants.manager
          .getRepository(Patient)
          .exists({ where: { id: dto.patientId } });
        if (!exists) throw AppException.notFound(ErrorCode.PatientNotFound);
      }
      item.patientId = dto.patientId ?? null;
    }
    if (dto.kind !== undefined) item.kind = dto.kind;
    if (dto.recordedName !== undefined)
      item.recordedName = dto.recordedName ?? '';
    if (dto.teethFdi !== undefined) {
      item.teethFdi = [...dto.teethFdi].sort((a, b) => a - b);
    }
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
    // A row not yet saved has none of the column defaults.
    item.followUpStatus ??= FollowUpStatus.Open;
    if (dto.followUpStatus !== undefined) {
      item.followUpStatus = dto.followUpStatus;
      // Booked or declined, there is no one left to call back — however it
      // was settled, from a call or the card's own status.
      if (dto.followUpStatus !== FollowUpStatus.Open) item.nextContactAt = null;
    }
    if (dto.followUpAppointmentAt !== undefined) {
      item.followUpAppointmentAt = dto.followUpAppointmentAt
        ? JalaliDate.parse(dto.followUpAppointmentAt).date
        : null;
    }
    // A day means something only while the patient is booked.
    if (item.followUpStatus !== FollowUpStatus.Booked) {
      item.followUpAppointmentAt = null;
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
      // has to grow with it or the two drift apart. It is the row's
      // patient's file when they have none yet — one file per patient —
      // and otherwise left for staff to link from the register screen.
      if (!implantCase && item.recordedName) {
        // Under the lock the stock and the register take, so a file one of
        // them opens meanwhile is seen here and not opened twice.
        if (item.patientId) {
          await lockImplantFile(implants.manager, item.patientId);
        }
        const owner =
          item.patientId &&
          !(await implants.exists({ where: { patientId: item.patientId } }))
            ? item.patientId
            : null;
        implantCase = await implants.save(
          implants.create({
            registryNo: dto.implantRegistryNo,
            recordedName: item.recordedName,
            patientId: owner,
            matchMethod: owner ? 'manual' : 'unmatched',
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

    // The same rules the register applies when it renames or renumbers the
    // case (`refreshCaseCopies`).
    item.hasNameMismatch = implantCase
      ? namesDiffer(implantCase.recordedName, item.recordedName)
      : false;
    // A row nobody linked takes its case's patient, when the two name the
    // same person. A link picked or cleared in this edit is left as chosen.
    if (
      dto.patientId === undefined &&
      !item.patientId &&
      implantCase?.patientId &&
      !item.hasNameMismatch
    ) {
      item.patientId = implantCase.patientId;
    }
    item.searchText = surgerySearchText(item);
    return registered;
  }

  private formatDate(
    value: Date | string,
    precision: DatePrecisionEnum | null,
  ): string {
    return JalaliDate.fromStored(value, precision ?? 'day')?.format() ?? '';
  }

  private toResponse(
    item: SurgeryQueueItem,
    lastContact: Record<string, unknown> | null = null,
    implants: PlacedImplant[] = [],
  ): Record<string, unknown> {
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
      // The row's own link. A case reached through a reused number is not
      // shown as the patient: the identity warning says whose it is.
      patient: item.patient
        ? {
            id: item.patient.id,
            fileNo: item.patient.fileNo,
            fullName:
              `${item.patient.firstName} ${item.patient.lastName}`.trim(),
            mobile: item.patient.mobile,
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
      teethFdi: item.teethFdi ?? [],
      toothPosition: item.toothPosition,
      implants,
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
      followUpStatus: item.followUpStatus,
      followUpAppointmentAt: item.followUpAppointmentAt
        ? this.formatDate(item.followUpAppointmentAt, null)
        : null,
      followUpState: followUpState(item),
      nextContactAt: item.nextContactAt
        ? {
            jalali: this.formatDate(item.nextContactAt, null),
            iso: JalaliDate.fromStored(item.nextContactAt)?.toIsoDate() ?? '',
          }
        : null,
      lastContact,
      status: item.status,
      notes: item.notes,
      /** Optimistic-concurrency token; send back as `expectedVersion` on update. */
      version: item.version,
    };
  }
}
