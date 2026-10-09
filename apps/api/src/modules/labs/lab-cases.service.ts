import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { addDays, differenceInCalendarDays } from 'date-fns-jalali';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';

import { LabCase } from './lab-case.entity';
import { LabTrip } from './lab-trip.entity';
import { Lab } from './lab.entity';
import { Patient } from '../patients/patient.entity';
import {
  BookLabCaseDto,
  CreateLabCaseDto,
  LabBoardQueryDto,
  LabCaseDateDto,
  QueryLabCasesDto,
  ReceiveLabCaseDto,
  SendLabCaseDto,
  UpdateLabCaseDto,
} from './dto/lab.dto';
import {
  expectedReturn,
  LabStage,
  labStage,
  latestTrip,
  openTrip,
  timeliness,
  todayIso,
} from './lab-stage';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import {
  ErrorCode,
  JAW_WORK_TYPES,
  JalaliDate,
  searchKey,
  storedDate,
} from '../../domain';

/** How far back the board's delivered column reaches without a search. */
const DELIVERED_DAYS = 30;
/** Enough for any clinic's month of deliveries; older ones are found by search. */
const DELIVERED_LIMIT = 50;

/** The board: every open case, and the recent deliveries. */
export interface LabBoard {
  atLab: unknown[];
  /** Back at the clinic, the patient not yet booked. */
  atClinic: unknown[];
  /** Back at the clinic, the patient booked for a day. */
  booked: unknown[];
  delivered: unknown[];
  /** Back at the clinic or delivered, with parts the lab still owes and a day for them. */
  partsChase: unknown[];
}

const jalali = (value: Date | string | null): string | null =>
  value ? (JalaliDate.fromStored(value)?.format() ?? null) : null;

/** A Jalali date from a request, or today when none was sent. */
const dayOrToday = (value: string | undefined): Date =>
  value ? JalaliDate.parse(value).date : storedDate(todayIso());

/** How long the lab has to send parts that did not come with the work, unless told otherwise. */
const DEFAULT_PARTS_DAYS = 7;

const partsOwed = (c: LabCase): boolean =>
  (c.impressionCount ?? 0) + (c.analogCount ?? 0) > 0 && !c.partsReturnedAt;

/** `partsOwed` as SQL; never null, so `NOT` of it is its exact complement. */
const PARTS_OWED_SQL = `(coalesce(c."impressionCount", 0) + coalesce(c."analogCount", 0) > 0 AND c."partsReturnedAt" IS NULL)`;

/**
 * Lab work, case by case. A case only ever moves through the four commands
 * here — receive, send, deliver, undo — each of which checks where the case
 * is first, so two people acting on the same card cannot both succeed.
 */
@Injectable()
export class LabCasesService {
  constructor(
    @InjectRepository(LabCase) private readonly cases: Repository<LabCase>,
    private readonly audit: AuditService,
  ) {}

  private query(): SelectQueryBuilder<LabCase> {
    return this.cases
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.lab', 'l')
      .leftJoinAndSelect('c.patient', 'p')
      .leftJoinAndSelect('c.trips', 't');
  }

  private search(qb: SelectQueryBuilder<LabCase>, q?: string): void {
    const key = searchKey(q);
    if (!key) return;
    for (const [i, word] of key.split(' ').entries()) {
      qb.andWhere(`c."searchText" LIKE :w${i}`, { [`w${i}`]: `%${word}%` });
    }
  }

  async board(dto: LabBoardQueryDto): Promise<LabBoard> {
    const active = this.query().andWhere('c."deliveredAt" IS NULL');
    // A case whose parts the lab still owes is not done: those are fetched on
    // their own, uncapped, so a busy month of deliveries cannot push them out.
    const owed = this.query()
      .andWhere('c."deliveredAt" IS NOT NULL')
      .andWhere(PARTS_OWED_SQL);
    const delivered = this.query()
      .andWhere('c."deliveredAt" IS NOT NULL')
      .andWhere(`NOT ${PARTS_OWED_SQL}`);
    for (const qb of [active, owed, delivered]) {
      this.search(qb, dto.q);
      if (dto.labId) qb.andWhere('c."labId" = :labId', { labId: dto.labId });
    }
    // A search reaches every delivery; without one the column is the last month's.
    if (!searchKey(dto.q)) {
      const since = JalaliDate.fromDate(addDays(new Date(), -DELIVERED_DAYS))!;
      delivered.andWhere('c."deliveredAt" >= :since', {
        since: since.toIsoDate(),
      });
    }
    for (const qb of [owed, delivered]) {
      qb.orderBy('c.deliveredAt', 'DESC').addOrderBy('c.id', 'ASC');
    }
    delivered.take(DELIVERED_LIMIT);

    const [open, owing, recent] = await Promise.all([
      active.getMany(),
      owed.getMany(),
      delivered.getMany(),
    ]);
    const now = new Date();
    const atLab = open.filter((c) => labStage(c) === 'at_lab');
    const atClinic = open.filter((c) => labStage(c) === 'at_clinic');
    const booked = open.filter((c) => labStage(c) === 'booked');

    // Most urgent first in each column: the lab furthest past its day, the
    // patient waiting longest to be called, the parts still owed.
    const due = (c: LabCase): number =>
      storedDate(openTrip(c.trips)!.expectedAt).getTime();
    const back = (c: LabCase): number =>
      storedDate(latestTrip(c.trips)?.receivedAt ?? c.createdAt).getTime();
    atLab.sort((a, b) => due(a) - due(b));
    atClinic.sort((a, b) => back(a) - back(b));
    // The soonest booking first; one already past is the oldest, so it leads.
    booked.sort(
      (a, b) =>
        storedDate(a.appointmentAt!).getTime() -
        storedDate(b.appointmentAt!).getTime(),
    );

    // Work that is back but whose parts the lab was given a day to send: the
    // lab's column lists them too, soonest due first, so someone can call.
    const chase = [...atClinic, ...booked, ...owing]
      .filter((c) => partsOwed(c) && c.partsDueAt)
      .sort(
        (a, b) =>
          storedDate(a.partsDueAt!).getTime() -
          storedDate(b.partsDueAt!).getTime(),
      );

    return {
      atLab: atLab.map((c) => this.toResponse(c, now)),
      atClinic: atClinic.map((c) => this.toResponse(c, now)),
      booked: booked.map((c) => this.toResponse(c, now)),
      delivered: [...owing, ...recent].map((c) => this.toResponse(c, now)),
      partsChase: chase.map((c) => this.toResponse(c, now)),
    };
  }

  async list(dto: QueryLabCasesDto): Promise<PageResult<unknown>> {
    const qb = this.query().skip(dto.skip).take(dto.limit);
    this.search(qb, dto.q);
    if (dto.patientId) {
      qb.andWhere('c."patientId" = :patientId', { patientId: dto.patientId });
    }
    if (dto.archivedOnly) {
      qb.withDeleted().andWhere('c."deletedAt" IS NOT NULL');
    }
    qb.orderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'ASC');
    const [items, total] = await qb.getManyAndCount();
    const now = new Date();
    return PageResult.of(
      items.map((c) => this.toResponse(c, now)),
      total,
      dto,
    );
  }

  async findOne(id: string): Promise<unknown> {
    const c = await this.query()
      .withDeleted()
      .where('c.id = :id', { id })
      .getOne();
    if (!c) throw AppException.notFound(ErrorCode.LabCaseNotFound);
    return this.toResponse(c, new Date());
  }

  async create(dto: CreateLabCaseDto, userId: string | null): Promise<unknown> {
    const id = await this.cases.manager.transaction(async (manager) => {
      const cases = manager.getRepository(LabCase);
      const c = cases.create({
        workTypes: [],
        teethFdi: [],
        teeth: '',
        searchText: '',
      });
      await this.assign(c, dto, manager);
      const saved = await cases.save(c);
      const sentAt = JalaliDate.parse(dto.sentAt).date;
      await manager.getRepository(LabTrip).save(
        manager.getRepository(LabTrip).create({
          labCaseId: saved.id,
          sequence: 1,
          kind: dto.tripKind,
          sentAt,
          waitDays: dto.waitDays,
          expectedAt: expectedReturn(sentAt, dto.waitDays),
          receivedAt: null,
          note: dto.tripNote ?? null,
        }),
      );
      await this.audit.recordRequired(
        {
          userId,
          action: 'create',
          entity: 'lab_case',
          entityId: saved.id,
          changes: {
            recordedName: saved.recordedName,
            labId: saved.labId,
            workTypes: saved.workTypes,
            tripKind: dto.tripKind,
            sentAt: dto.sentAt,
          },
        },
        manager,
      );
      return saved.id;
    });
    return this.findOne(id);
  }

  /**
   * Correct a case, and its latest trip with it — the form shows that trip's
   * kind, date and turnaround beside the case's own fields.
   */
  async update(
    id: string,
    { expectedVersion, ...dto }: UpdateLabCaseDto,
    userId: string | null,
  ): Promise<unknown> {
    await this.cases.manager.transaction(async (manager) => {
      const cases = manager.getRepository(LabCase);
      const c = await cases.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!c) throw AppException.notFound(ErrorCode.LabCaseNotFound);
      if (c.version !== expectedVersion) {
        throw AppException.conflict(ErrorCode.LabCaseModified);
      }
      await this.assign(c, dto, manager);
      await cases.save(c);

      const tripEdit =
        dto.tripKind !== undefined ||
        dto.sentAt !== undefined ||
        dto.waitDays !== undefined ||
        dto.tripNote !== undefined;
      if (tripEdit) {
        const trips = manager.getRepository(LabTrip);
        const trip = latestTrip(await trips.find({ where: { labCaseId: id } }));
        if (trip) {
          if (dto.tripKind !== undefined) trip.kind = dto.tripKind;
          if (dto.sentAt) trip.sentAt = JalaliDate.parse(dto.sentAt).date;
          if (dto.waitDays !== undefined) trip.waitDays = dto.waitDays;
          if (dto.tripNote !== undefined) trip.note = dto.tripNote ?? null;
          trip.expectedAt = expectedReturn(trip.sentAt, trip.waitDays);
          await trips.save(trip);
        }
        await cases.increment({ id }, 'version', 1);
      }

      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'lab_case',
          entityId: id,
          changes: dto,
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * Back from the lab: the trip out is closed and the patient can be booked.
   * The work and the impression parts that went with it travel separately, so
   * the parts are only counted back when the receipt says they came too.
   */
  receive(
    id: string,
    dto: ReceiveLabCaseDto,
    userId: string | null,
  ): Promise<unknown> {
    return this.move(id, userId, ['at_lab'], async (c, manager) => {
      const trip = openTrip(c.trips)!;
      trip.receivedAt = dayOrToday(dto.date);
      await manager.getRepository(LabTrip).save(trip);
      const owed = partsOwed(c);
      const partsCame = owed && dto.partsReturned === true;
      // Only the work came: the lab is given until the day named to send the parts.
      const partsDueAt =
        owed && dto.partsReturned === false
          ? expectedReturn(
              trip.receivedAt,
              dto.partsWaitDays ?? DEFAULT_PARTS_DAYS,
            )
          : null;
      if (partsCame) {
        await manager
          .getRepository(LabCase)
          .update(c.id, { partsReturnedAt: trip.receivedAt });
      } else if (partsDueAt) {
        await manager.getRepository(LabCase).update(c.id, { partsDueAt });
      }
      return {
        event: 'receive',
        sequence: trip.sequence,
        date: jalali(trip.receivedAt),
        ...(partsCame ? { partsReturned: true } : {}),
        ...(partsDueAt ? { partsDueAt: jalali(partsDueAt) } : {}),
      };
    });
  }

  /** Back to the lab for the next step: a try-in went fine, or needs a correction. */
  send(
    id: string,
    dto: SendLabCaseDto,
    userId: string | null,
  ): Promise<unknown> {
    return this.move(
      id,
      userId,
      ['at_clinic', 'booked'],
      async (c, manager) => {
        const sentAt = dayOrToday(dto.sentAt);
        // Back to the lab, the booking no longer holds: it is made again on the way back.
        if (c.appointmentAt) {
          await manager
            .getRepository(LabCase)
            .update(c.id, { appointmentAt: null });
        }
        const trips = manager.getRepository(LabTrip);
        const trip = await trips.save(
          trips.create({
            labCaseId: c.id,
            sequence: (latestTrip(c.trips)?.sequence ?? 0) + 1,
            kind: dto.kind,
            sentAt,
            waitDays: dto.waitDays,
            expectedAt: expectedReturn(sentAt, dto.waitDays),
            receivedAt: null,
            note: dto.note ?? null,
          }),
        );
        return {
          event: 'send',
          sequence: trip.sequence,
          kind: trip.kind,
          date: jalali(trip.sentAt),
          waitDays: trip.waitDays,
        };
      },
    );
  }

  /**
   * The front desk gave the patient a day for the fitting — or changed it. The
   * day is what the case waits for, so a booking from the clinic column moves
   * it to the booked one, and a new day on a booked case moves it nowhere.
   */
  book(
    id: string,
    dto: BookLabCaseDto,
    userId: string | null,
  ): Promise<unknown> {
    return this.move(
      id,
      userId,
      ['at_clinic', 'booked'],
      async (c, manager) => {
        const appointmentAt = JalaliDate.parse(dto.date).date;
        await manager.getRepository(LabCase).update(c.id, { appointmentAt });
        return {
          event: 'book',
          date: jalali(appointmentAt),
          ...(c.appointmentAt ? { changedFrom: jalali(c.appointmentAt) } : {}),
        };
      },
    );
  }

  /** Fitted for the patient. Only from the clinic: what is at the lab is received first. */
  deliver(
    id: string,
    dto: LabCaseDateDto,
    userId: string | null,
  ): Promise<unknown> {
    return this.move(
      id,
      userId,
      ['at_clinic', 'booked'],
      async (c, manager) => {
        const deliveredAt = dayOrToday(dto.date);
        await manager.getRepository(LabCase).update(c.id, { deliveredAt });
        return { event: 'deliver', date: jalali(deliveredAt) };
      },
    );
  }

  /**
   * Take back the last move, for the wrong button pressed: a delivery goes
   * back to the clinic, a receipt back to the lab, and a trip sent by mistake
   * is removed. A case's first trip is what opened it, so it has nothing
   * before it to go back to — that case is archived instead.
   */
  async undo(
    id: string,
    expectedVersion: number,
    userId: string | null,
  ): Promise<unknown> {
    return this.move(
      id,
      userId,
      ['at_lab', 'at_clinic', 'booked', 'delivered'],
      async (c, manager, stage) => {
        if (c.version !== expectedVersion) {
          throw AppException.conflict(ErrorCode.LabCaseModified);
        }
        if (stage === 'delivered') {
          await manager
            .getRepository(LabCase)
            .update(c.id, { deliveredAt: null });
          return {
            event: 'undo',
            undone: 'deliver',
            date: jalali(c.deliveredAt),
          };
        }
        if (stage === 'booked') {
          await manager
            .getRepository(LabCase)
            .update(c.id, { appointmentAt: null });
          return {
            event: 'undo',
            undone: 'book',
            date: jalali(c.appointmentAt),
          };
        }
        const trips = manager.getRepository(LabTrip);
        const latest = latestTrip(c.trips)!;
        if (stage === 'at_clinic') {
          const date = jalali(latest.receivedAt);
          // Back at the lab, the work and its parts are together again: parts
          // counted back with this receipt go back with it, and a chase is moot.
          if (c.partsReturnedAt && jalali(c.partsReturnedAt) === date) {
            await manager
              .getRepository(LabCase)
              .update(c.id, { partsReturnedAt: null });
          }
          if (c.partsDueAt) {
            await manager
              .getRepository(LabCase)
              .update(c.id, { partsDueAt: null });
          }
          latest.receivedAt = null;
          await trips.save(latest);
          return {
            event: 'undo',
            undone: 'receive',
            sequence: latest.sequence,
            date,
          };
        }
        if (c.trips.length < 2) {
          throw AppException.conflict(ErrorCode.LabCaseNothingToUndo);
        }
        await trips.delete(latest.id);
        return {
          event: 'undo',
          undone: 'send',
          sequence: latest.sequence,
          kind: latest.kind,
          date: jalali(latest.sentAt),
        };
      },
    );
  }

  /**
   * The lab gave back the impression copings and analogs — or, switched off,
   * has not after all. Like the surgery list's follow-up switch it is one fact
   * and needs no version; the lock keeps the save from writing back a copy
   * another edit has moved on from.
   */
  async partsReturned(
    id: string,
    returned: boolean,
    userId: string | null,
  ): Promise<unknown> {
    await this.cases.manager.transaction(async (manager) => {
      const cases = manager.getRepository(LabCase);
      const c = await cases.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!c) throw AppException.notFound(ErrorCode.LabCaseNotFound);
      c.partsReturnedAt = returned ? storedDate(todayIso()) : null;
      await cases.save(c);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'lab_case',
          entityId: id,
          changes: { partsReturnedAt: jalali(c.partsReturnedAt) },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  async remove(id: string, userId: string | null): Promise<void> {
    await this.cases.manager.transaction(async (manager) => {
      const cases = manager.getRepository(LabCase);
      const c = await cases.findOne({ where: { id } });
      if (!c) throw AppException.notFound(ErrorCode.LabCaseNotFound);
      await cases.softDelete(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'delete',
          entity: 'lab_case',
          entityId: id,
          changes: { recordedName: c.recordedName },
        },
        manager,
      );
    });
  }

  async restore(id: string, userId: string | null): Promise<unknown> {
    await this.cases.manager.transaction(async (manager) => {
      const cases = manager.getRepository(LabCase);
      const c = await cases.findOne({ where: { id }, withDeleted: true });
      if (!c) throw AppException.notFound(ErrorCode.LabCaseNotFound);
      await cases.restore(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'restore',
          entity: 'lab_case',
          entityId: id,
          changes: { recordedName: c.recordedName },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * One move of a case, in one transaction: lock the case, check it is where
   * the move starts from, apply, bump the version so an open edit form knows,
   * and audit. A case that has moved on is refused with where it is now.
   */
  private async move(
    id: string,
    userId: string | null,
    from: readonly LabStage[],
    apply: (
      c: LabCase,
      manager: EntityManager,
      stage: LabStage,
    ) => Promise<Record<string, unknown>>,
  ): Promise<unknown> {
    await this.cases.manager.transaction(async (manager) => {
      const cases = manager.getRepository(LabCase);
      const c = await cases.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!c) throw AppException.notFound(ErrorCode.LabCaseNotFound);
      c.trips = await manager
        .getRepository(LabTrip)
        .find({ where: { labCaseId: id } });
      const stage = labStage(c);
      if (!from.includes(stage)) {
        throw AppException.conflict(ErrorCode.LabCaseMoved, { stage });
      }
      const changes = await apply(c, manager, stage);
      await cases.increment({ id }, 'version', 1);
      await this.audit.recordRequired(
        { userId, action: 'update', entity: 'lab_case', entityId: id, changes },
        manager,
      );
    });
    return this.findOne(id);
  }

  /** Apply the case's own fields, checking the lab and patient they name exist. */
  private async assign(
    c: LabCase,
    dto: Partial<CreateLabCaseDto>,
    manager: EntityManager,
  ): Promise<void> {
    if (dto.labId !== undefined && dto.labId !== c.labId) {
      const lab = await manager
        .getRepository(Lab)
        .findOne({ where: { id: dto.labId } });
      if (!lab) throw AppException.notFound(ErrorCode.LabNotFound);
      c.labId = lab.id;
    }
    if (dto.patientId !== undefined && dto.patientId !== c.patientId) {
      if (dto.patientId) {
        const exists = await manager
          .getRepository(Patient)
          .exists({ where: { id: dto.patientId } });
        if (!exists) throw AppException.notFound(ErrorCode.PatientNotFound);
      }
      c.patientId = dto.patientId ?? null;
    }
    if (dto.recordedName !== undefined) c.recordedName = dto.recordedName;
    if (dto.workTypes !== undefined) c.workTypes = dto.workTypes;
    if (dto.jaw !== undefined) c.jaw = dto.jaw ?? null;
    if (dto.teethFdi !== undefined) {
      c.teethFdi = [...dto.teethFdi].sort((a, b) => a - b);
    }
    // Per-jaw work has a jaw and no teeth; everything else has teeth and no jaw.
    if (c.workTypes.some((t) => JAW_WORK_TYPES.includes(t))) {
      c.teethFdi = [];
    } else {
      c.jaw = null;
    }
    // Teeth picked from the chart replace what a case was first written with.
    if (c.teethFdi.length || c.jaw) {
      c.toothCount = null;
      c.teeth = '';
    }
    if (dto.implantBrand !== undefined)
      c.implantBrand = dto.implantBrand ?? null;
    if (dto.impressionCount !== undefined)
      c.impressionCount = dto.impressionCount ?? null;
    if (dto.analogCount !== undefined) c.analogCount = dto.analogCount ?? null;
    if (dto.notes !== undefined) c.notes = dto.notes ?? null;

    const fileNo = c.patientId
      ? (
          await manager
            .getRepository(Patient)
            .findOne({ where: { id: c.patientId }, select: { fileNo: true } })
        )?.fileNo
      : null;
    c.searchText = searchKey(
      [c.recordedName, fileNo, c.teeth, c.teethFdi.join(' '), c.implantBrand]
        .filter(Boolean)
        .join(' '),
    );
  }

  private toResponse(c: LabCase, now: Date): Record<string, unknown> {
    const trips = [...(c.trips ?? [])].sort((a, b) => a.sequence - b.sequence);
    const stage = labStage({
      deliveredAt: c.deliveredAt,
      appointmentAt: c.appointmentAt,
      trips,
    });
    const latest = latestTrip(trips);
    const open = stage === 'at_lab' ? openTrip(trips) : null;
    const due = open ? timeliness(open.expectedAt, now) : null;
    // A booked case is judged against its day: how far off, or how long past.
    const booking =
      stage === 'booked' && c.appointmentAt
        ? timeliness(c.appointmentAt, now)
        : null;
    // The parts are on their own clock once the work is back without them.
    const parts =
      stage !== 'at_lab' && partsOwed(c) && c.partsDueAt
        ? timeliness(c.partsDueAt, now)
        : null;
    // When the case entered the column it is in: the trip out left, the trip
    // back arrived, or the patient was fitted.
    const since =
      stage === 'at_lab'
        ? open!.sentAt
        : stage === 'at_clinic' || stage === 'booked'
          ? (latest?.receivedAt ?? null)
          : c.deliveredAt;
    return {
      id: c.id,
      patientId: c.patientId,
      patient: c.patient
        ? {
            id: c.patient.id,
            fileNo: c.patient.fileNo,
            fullName: `${c.patient.firstName} ${c.patient.lastName}`.trim(),
            mobile: c.patient.mobile,
          }
        : null,
      recordedName: c.recordedName,
      lab: c.lab
        ? { id: c.lab.id, name: c.lab.name, isActive: c.lab.isActive }
        : null,
      workTypes: c.workTypes,
      jaw: c.jaw,
      teethFdi: c.teethFdi,
      // Counted from the chart; the typed count only for cases that predate it.
      toothCount: c.teethFdi.length || c.toothCount,
      teeth: c.teeth,
      implantBrand: c.implantBrand,
      impressionCount: c.impressionCount,
      analogCount: c.analogCount,
      partsReturnedAt: jalali(c.partsReturnedAt),
      appointmentAt: jalali(c.appointmentAt),
      appointmentTimeliness: booking?.state ?? null,
      appointmentDays:
        stage === 'booked' && c.appointmentAt
          ? differenceInCalendarDays(storedDate(c.appointmentAt), now)
          : null,
      partsOutstanding: partsOwed(c),
      partsDueAt: partsOwed(c) ? jalali(c.partsDueAt) : null,
      partsTimeliness: parts?.state ?? null,
      partsDaysLate: parts?.daysLate ?? 0,
      deliveredAt: jalali(c.deliveredAt),
      stage,
      since: jalali(since),
      daysInStage: since
        ? differenceInCalendarDays(now, storedDate(since))
        : null,
      timeliness: due?.state ?? null,
      daysLate: due?.daysLate ?? 0,
      trips: trips.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        kind: t.kind,
        sentAt: jalali(t.sentAt),
        waitDays: t.waitDays,
        expectedAt: jalali(t.expectedAt),
        receivedAt: jalali(t.receivedAt),
        note: t.note,
      })),
      notes: c.notes,
      isArchived: c.deletedAt !== null,
      /** Optimistic-concurrency token; send back as `expectedVersion` on update and undo. */
      version: c.version,
    };
  }
}
