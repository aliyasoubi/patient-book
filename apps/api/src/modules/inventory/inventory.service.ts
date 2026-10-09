import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { format as formatJalali } from 'date-fns-jalali';
import { EntityManager, In, Not, Repository } from 'typeorm';

import { InventoryItem } from './inventory-item.entity';
import { InventoryLot } from './inventory-lot.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { loadLots, writeMovement } from './inventory-ledger';
import {
  BRANDS,
  canonicalBrand,
  normalizeSpec,
  TRACEABLE,
} from './inventory-catalog';
import { Patient } from '../patients/patient.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { ImplantRegistryService } from '../implants/implant-registry.service';
import { SurgeryService } from '../surgery/surgery.service';
import {
  CreateInventoryItemDto,
  InventoryCountDto,
  InventoryMovementDto,
  QueryInventoryDto,
  UpdateInventoryItemDto,
  UpdateInventoryLotDto,
} from './dto/inventory.dto';
import {
  count,
  expiryHorizon,
  expirySoonSql,
  expiryState,
  fefo,
  identityKey,
  inventorySearchKey,
  itemSearchText,
  LotChange,
  LotLevel,
  nearestExpiry,
  normalizeLot,
  parseExpiry,
  receive,
  reorderSql,
  stockState,
  take,
} from './inventory-stock';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import {
  ErrorCode,
  extractImplantBrand,
  InventoryCategory,
  InventoryMovementKind,
  InventoryUnit,
  JalaliDate,
  SurgeryKind,
  toLatinDigits,
} from '../../domain';

/**
 * Months from an implant to its prosthesis — the surgery list's own default
 * for an implant, so a row written from the stock is due like one typed there.
 */
const PROSTHESIS_AFTER_MONTHS = 3;

/** Enough of an item's stock card for the screen; older lines stay in the table. */
const HISTORY_LIMIT = 100;

/**
 * Shelf order: by category as declared, then brand — the workbook kept a
 * sheet per implant system — then name and size, in natural order (see the
 * `fa_natural` collation in the Inventory migration). A size is ordered by
 * its leading number first, so 4.5x8 follows 4x12 as diameters do, and the
 * rest is compared without the spaces some rows have and others lack.
 */
const SHELF_ORDER = [
  'i.category',
  'i."brand" COLLATE "fa_natural"',
  'i."name" COLLATE "fa_natural"',
  `CAST(substring(i."spec" from '^\\s*([0-9]+(?:\\.[0-9]+)?)') AS numeric)`,
  `regexp_replace(i."spec", '\\s', '', 'g') COLLATE "fa_natural"`,
] as const;

/**
 * The clinic's stock. Items are edited here; their quantities move only
 * through a movement — {@link move}, or a shelf counted at once with
 * {@link count} — which locks the item, works out which batches change by the
 * rules in `inventory-stock.ts`, and writes one stock card line per batch in
 * the same transaction. The card is the stock's audit trail, so a movement
 * writes no separate audit row; edits, archiving and restoring do.
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
    private readonly audit: AuditService,
    private readonly surgery: SurgeryService,
    private readonly implantRegistry: ImplantRegistryService,
  ) {}

  async list(dto: QueryInventoryDto): Promise<unknown[]> {
    const qb = this.items.createQueryBuilder('i');
    const key = inventorySearchKey(dto.q);
    if (key) {
      for (const [n, word] of key.split(' ').entries()) {
        qb.andWhere(`i."searchText" LIKE :w${n}`, { [`w${n}`]: `%${word}%` });
      }
    }
    if (dto.category) {
      qb.andWhere('i.category = :category', { category: dto.category });
    }
    if (dto.archivedOnly) {
      qb.withDeleted().andWhere('i."deletedAt" IS NOT NULL');
    }
    switch (dto.filter) {
      case 'reorder':
        qb.andWhere(reorderSql('i'));
        break;
      case 'out':
        qb.andWhere('i.quantity = 0');
        break;
      case 'expiry':
        qb.andWhere(expirySoonSql('i', ':horizon'), {
          horizon: expiryHorizon(),
        });
        // Soonest first: what to use up, or throw away, next.
        qb.orderBy('i."expiresOn"', 'ASC');
        break;
    }
    for (const column of SHELF_ORDER) {
      qb.addOrderBy(column, 'ASC', 'NULLS FIRST');
    }
    qb.addOrderBy('i.id', 'ASC');

    const now = new Date();
    return (await qb.getMany()).map((i) => this.toResponse(i, now));
  }

  /**
   * Brands to offer as a brand is typed: the catalogue's, as it spells them
   * with the other ways each is written — «دنت» finds Dentium — and any other
   * brand already on the shelves.
   */
  async brands(): Promise<Array<{ name: string; spellings: string[] }>> {
    const rows = await this.items
      .createQueryBuilder('i')
      .select('DISTINCT i.brand', 'brand')
      .where('i.brand IS NOT NULL')
      .getRawMany<{ brand: string }>();
    const listed = new Set(BRANDS.map((b) => b.name));
    return [
      ...BRANDS.map((b) => ({ name: b.name, spellings: [...b.aliases] })),
      ...rows
        .filter((r) => !listed.has(r.brand))
        .map((r) => ({ name: r.brand, spellings: [] })),
    ].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }

  /** One item, its batches on the shelf first-expiring first, and its stock card newest first. */
  async findOne(id: string): Promise<unknown> {
    const item = await this.items.findOne({ where: { id }, withDeleted: true });
    if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
    const lots = await loadLots(this.items.manager, id);
    const movements = await this.items.query<
      Array<
        InventoryMovement & {
          fullName: string | null;
          account: string | null;
          lotNumber: string | null;
          fileNo: string | null;
        }
      >
    >(
      `SELECT m.*, u."fullName", u.username AS account, l."lotNumber", p."fileNo"
         FROM inventory_movements m
         LEFT JOIN users u ON u.id = m."userId"
         LEFT JOIN inventory_lots l ON l.id = m."lotId"
         LEFT JOIN patients p ON p.id = m."patientId"
        WHERE m."itemId" = $1
        ORDER BY m.seq DESC
        LIMIT ${HISTORY_LIMIT}`,
      [id],
    );
    const now = new Date();
    return {
      ...this.toResponse(item, now),
      lots: fefo(lots)
        .filter((l) => l.quantity > 0)
        .map((l) => ({
          id: l.id,
          lotNumber: l.lotNumber,
          expiry: l.expiryText,
          expiryState: expiryState(l.expiresOn, l.quantity, now),
          quantity: l.quantity,
        })),
      movements: movements.map((m) => ({
        id: m.id,
        kind: m.kind,
        change: m.change,
        quantityAfter: m.quantityAfter,
        lotNumber: m.lotNumber,
        expiry: m.expiryText,
        patient:
          m.patientId && m.fileNo
            ? { id: m.patientId, fileNo: m.fileNo }
            : null,
        note: m.note,
        by: m.fullName?.trim() || m.account || m.username,
        at: formatJalali(new Date(m.createdAt), 'yyyy/MM/dd HH:mm'),
      })),
    };
  }

  async create(
    dto: CreateInventoryItemDto,
    userId: string | null,
  ): Promise<unknown> {
    const id = await this.items.manager.transaction(async (manager) => {
      const items = manager.getRepository(InventoryItem);
      const item = items.create({
        unit: InventoryUnit.Piece,
        quantity: 0,
        minQuantity: null,
        expiresOn: null,
        expiryText: null,
      });
      this.assign(item, dto);
      if (
        dto.quantity &&
        TRACEABLE.has(item.category) &&
        (!normalizeLot(dto.lotNumber) || !parseExpiry(dto.expiry))
      ) {
        throw AppException.badRequest(ErrorCode.InventoryLotRequired);
      }
      await this.refuseDuplicate(manager, item);
      const saved = await items.save(item);
      // What is on the shelf opens the first batch, as the item's first
      // count, so its stock card adds up from the very first line.
      if (dto.quantity) {
        const opening = receive([], {
          quantity: dto.quantity,
          lotNumber: dto.lotNumber,
          expiry: parseExpiry(dto.expiry),
        });
        await writeMovement(
          manager,
          saved,
          InventoryMovementKind.Count,
          [opening],
          {
            userId,
          },
        );
      }
      await this.audit.recordRequired(
        {
          userId,
          action: 'create',
          entity: 'inventory_item',
          entityId: saved.id,
          changes: { ...dto },
        },
        manager,
      );
      return saved.id;
    });
    return this.findOne(id);
  }

  async update(
    id: string,
    { expectedVersion, ...dto }: UpdateInventoryItemDto,
    userId: string | null,
  ): Promise<unknown> {
    await this.items.manager.transaction(async (manager) => {
      const items = manager.getRepository(InventoryItem);
      const item = await this.lock(manager, id);
      if (item.version !== expectedVersion) {
        throw AppException.conflict(ErrorCode.InventoryItemModified);
      }
      this.assign(item, dto);
      await this.refuseDuplicate(manager, item);
      await items.save(item);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'inventory_item',
          entityId: id,
          changes: { ...dto },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * A delivery, a use, a discard or a count. Needs no version: a delivery
   * adds to whatever is there, and a count is what is on the shelf now. The
   * lock makes two at once queue rather than both read the same batches.
   */
  async move(
    id: string,
    dto: InventoryMovementDto,
    userId: string | null,
  ): Promise<unknown> {
    await this.items.manager.transaction(async (manager) => {
      const item = await this.lock(manager, id);
      const lots = await loadLots(manager, id);
      let changes: LotChange<InventoryLot | LotLevel>[];
      switch (dto.kind) {
        case InventoryMovementKind.Receive:
          if (
            TRACEABLE.has(item.category) &&
            (!normalizeLot(dto.lotNumber) || !parseExpiry(dto.expiry))
          ) {
            throw AppException.badRequest(ErrorCode.InventoryLotRequired);
          }
          changes = [
            receive(lots, {
              quantity: dto.quantity,
              lotNumber: dto.lotNumber,
              expiry: parseExpiry(dto.expiry),
            }),
          ];
          break;
        case InventoryMovementKind.Use:
        case InventoryMovementKind.Discard:
          changes = take(lots, dto.quantity, dto.lotId);
          if (dto.kind === InventoryMovementKind.Use && !dto.lotId) {
            this.refuseExpiredUse(item, changes);
          }
          break;
        case InventoryMovementKind.Count:
          changes = count(lots, dto.quantity);
          this.refuseUntracedCount(item, changes);
          break;
      }
      const patientId =
        dto.kind !== InventoryMovementKind.Use
          ? null
          : dto.patientId
            ? await this.patientById(manager, dto.patientId)
            : dto.patientFileNo
              ? await this.patientByFile(manager, dto.patientFileNo)
              : null;
      const lines = await writeMovement(manager, item, dto.kind, changes, {
        userId,
        note: dto.note,
        patientId,
      });
      if (patientId && item.category === InventoryCategory.Implant) {
        await this.placeImplants(
          manager,
          item,
          lines,
          patientId,
          dto.tooth,
          userId,
        );
      }
    });
    return this.findOne(id);
  }

  /**
   * Take back the last movement on an item — a wrong button or a mistyped
   * number, put right the moment it is seen. Only while nothing else has
   * touched the item since (`expectedVersion`), so it can never take back
   * someone else's work. Its lines leave the stock card, its batches go back
   * to what they held — a batch it opened goes with it — and an audit row
   * keeps what was taken back.
   */
  async undo(
    id: string,
    expectedVersion: number,
    userId: string | null,
  ): Promise<unknown> {
    await this.items.manager.transaction(async (manager) => {
      const item = await this.lock(manager, id);
      if (item.version !== expectedVersion) {
        throw AppException.conflict(ErrorCode.InventoryItemModified);
      }
      const movements = manager.getRepository(InventoryMovement);
      // One movement is every line written in its transaction, which share
      // `createdAt` to the microsecond — compared in SQL, since a JS date
      // keeps only milliseconds.
      const rows = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM inventory_movements
          WHERE "itemId" = $1
            AND "createdAt" = (SELECT "createdAt" FROM inventory_movements
                                WHERE "itemId" = $1 ORDER BY seq DESC LIMIT 1)`,
        [id],
      );
      if (!rows.length) {
        throw AppException.conflict(ErrorCode.InventoryNothingToUndo);
      }
      const lines = await movements.findBy({ id: In(rows.map((r) => r.id)) });
      const lots = manager.getRepository(InventoryLot);
      for (const line of lines) {
        if (!line.lotId) continue;
        const lot = await lots.findOneBy({ id: line.lotId });
        if (!lot) continue;
        lot.quantity -= line.change;
        const elsewhere = await movements.exists({
          where: { lotId: lot.id, id: Not(In(lines.map((l) => l.id))) },
        });
        if (lot.quantity === 0 && !elsewhere) await lots.delete(lot.id);
        else await lots.save(lot);
      }
      // An implant handed to a patient wrote its surgery rows: they go too.
      const withdrawn = await this.surgery.withdrawStockRows(
        manager,
        lines.map((l) => l.id),
        userId,
      );
      await movements.delete(lines.map((l) => l.id));
      const after = await loadLots(manager, id);
      await manager.getRepository(InventoryItem).update(id, {
        quantity: after.reduce((n, l) => n + l.quantity, 0),
        ...nearestExpiry(after),
        version: () => '"version" + 1',
      });
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'inventory_item',
          entityId: id,
          changes: {
            undone: lines.map((l) => ({
              kind: l.kind,
              change: l.change,
              lotId: l.lotId,
            })),
            ...(withdrawn ? { surgeryRowsWithdrawn: withdrawn } : {}),
          },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * A shelf counted at once: each line's count corrects its batches as a
   * single count would, and its reorder level is set alongside — the moment
   * someone is looking at the shelf is when the level is best judged. One
   * transaction: a stocktake is saved whole or not at all.
   */
  async count(
    dto: InventoryCountDto,
    userId: string | null,
  ): Promise<{ counted: number; minimums: number }> {
    return this.items.manager.transaction(async (manager) => {
      let counted = 0;
      let minimums = 0;
      // Locked in one order, so two stocktakes overlapping cannot deadlock.
      const lines = [...dto.lines].sort((a, b) => a.id.localeCompare(b.id));
      for (const line of lines) {
        const item = await this.lock(manager, line.id);
        if (line.quantity !== undefined && line.quantity !== item.quantity) {
          const lots = await loadLots(manager, item.id);
          const changes = count(lots, line.quantity);
          this.refuseUntracedCount(item, changes);
          await writeMovement(
            manager,
            item,
            InventoryMovementKind.Count,
            changes,
            { userId },
          );
          counted++;
        }
        const minQuantity = line.minQuantity;
        if (minQuantity !== undefined && minQuantity !== item.minQuantity) {
          await manager.getRepository(InventoryItem).update(item.id, {
            minQuantity,
            version: () => '"version" + 1',
          });
          await this.audit.recordRequired(
            {
              userId,
              action: 'update',
              entity: 'inventory_item',
              entityId: item.id,
              changes: { minQuantity },
            },
            manager,
          );
          minimums++;
        }
      }
      return { counted, minimums };
    });
  }

  /**
   * Put right what a batch's packs say — a lot number or an expiry typed
   * wrong on delivery. Its quantity is not touched: that moves by a movement.
   */
  async updateLot(
    itemId: string,
    lotId: string,
    dto: UpdateInventoryLotDto,
    userId: string | null,
  ): Promise<unknown> {
    await this.items.manager.transaction(async (manager) => {
      const item = await this.lock(manager, itemId);
      const lots = await loadLots(manager, itemId);
      const lot = lots.find((l) => l.id === lotId);
      if (!lot) throw AppException.notFound(ErrorCode.InventoryLotNotFound);
      if (dto.lotNumber !== undefined)
        lot.lotNumber = normalizeLot(dto.lotNumber);
      if (dto.expiry !== undefined) {
        const expiry = parseExpiry(dto.expiry);
        lot.expiresOn = expiry?.date ?? null;
        lot.expiryText = expiry?.text ?? null;
      }
      const clash = lots.some(
        (l) =>
          l.id !== lot.id &&
          l.lotNumber === lot.lotNumber &&
          l.expiryText === lot.expiryText,
      );
      if (clash) throw AppException.conflict(ErrorCode.InventoryLotExists);
      await manager.getRepository(InventoryLot).save(lot);
      await manager.getRepository(InventoryItem).update(item.id, {
        ...nearestExpiry(lots),
        version: () => '"version" + 1',
      });
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'inventory_item',
          entityId: item.id,
          changes: {
            lot: {
              id: lot.id,
              lotNumber: lot.lotNumber,
              expiry: lot.expiryText,
            },
          },
        },
        manager,
      );
    });
    return this.findOne(itemId);
  }

  async archive(id: string, userId: string | null): Promise<void> {
    await this.items.manager.transaction(async (manager) => {
      const items = manager.getRepository(InventoryItem);
      const item = await items.findOne({ where: { id } });
      if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
      await items.softDelete(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'delete',
          entity: 'inventory_item',
          entityId: id,
          changes: { name: item.name, quantity: item.quantity },
        },
        manager,
      );
    });
  }

  async restore(id: string, userId: string | null): Promise<unknown> {
    await this.items.manager.transaction(async (manager) => {
      const items = manager.getRepository(InventoryItem);
      const item = await items.findOne({ where: { id }, withDeleted: true });
      if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
      // Re-added under the same name while archived: restoring would split its stock.
      await this.refuseDuplicate(manager, item);
      await items.restore(id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'restore',
          entity: 'inventory_item',
          entityId: id,
          changes: { name: item.name },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  private async lock(
    manager: EntityManager,
    id: string,
  ): Promise<InventoryItem> {
    const item = await manager.getRepository(InventoryItem).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
    return item;
  }

  /**
   * A use of an implant, graft or membrane left to go first-expiring first
   * would take a box past its date: refused, so an expired one only goes in
   * when someone picked that batch on purpose.
   */
  private refuseExpiredUse(
    item: InventoryItem,
    changes: LotChange<InventoryLot | LotLevel>[],
  ): void {
    if (!TRACEABLE.has(item.category)) return;
    const now = new Date();
    if (
      changes.some((c) => expiryState(c.lot.expiresOn, 1, now) === 'expired')
    ) {
      throw AppException.conflict(ErrorCode.InventoryLotExpired);
    }
  }

  /**
   * A count of implants, grafts or membranes that finds more than recorded
   * would put the extra in a batch with no lot — a box nobody could trace.
   * The extra comes in as a delivery instead, with the lot on its box.
   */
  private refuseUntracedCount(
    item: InventoryItem,
    changes: LotChange<InventoryLot | LotLevel>[],
  ): void {
    if (!TRACEABLE.has(item.category)) return;
    if (changes.some((c) => c.change > 0 && !c.lot.lotNumber)) {
      throw AppException.badRequest(ErrorCode.InventoryCountUntraced, {
        id: item.id,
        name: [item.name, item.brand, item.spec].filter(Boolean).join(' · '),
      });
    }
  }

  /**
   * Implants handed to a patient go into the patient's implant file — the
   * file they already have, or a new one under the book's next number — as
   * one surgery row per implant, dated today with the prosthesis due, naming
   * the system, the tooth and the box. Each row keeps the stock card line it
   * came from, so an undo takes it back.
   */
  private async placeImplants(
    manager: EntityManager,
    item: InventoryItem,
    lines: InventoryMovement[],
    patientId: string,
    tooth: string | null | undefined,
    userId: string | null,
  ): Promise<void> {
    const implantCase =
      (await manager.getRepository(ImplantCase).findOne({
        where: { patientId },
        order: { createdAt: 'DESC' },
      })) ??
      (await this.implantRegistry.createIn(manager, { patientId }, userId));
    const lotNumbers = new Map(
      (await loadLots(manager, item.id)).map((l) => [l.id, l.lotNumber]),
    );
    // One row per implant: a line that took two out stands for two.
    const units = lines.flatMap((line) =>
      Array.from({ length: Math.max(-line.change, 0) }, () => line),
    );
    // «36 37» for two implants is one tooth each; anything else goes on every row.
    const written = toLatinDigits(tooth ?? '').trim();
    const teeth = written.split(/[\s,،;؛]+/).filter(Boolean);
    const today = JalaliDate.today().format();
    for (const [i, line] of units.entries()) {
      const lot = line.lotId ? lotNumbers.get(line.lotId) : null;
      await this.surgery.createIn(
        manager,
        {
          kind: SurgeryKind.Implant,
          implantCaseId: implantCase.id,
          recordedName: implantCase.recordedName,
          surgeryDate: today,
          toothPosition: teeth.length === units.length ? teeth[i] : written,
          implantBrand: extractImplantBrand(item.brand) ?? item.brand,
          followUpMonths: PROSTHESIS_AFTER_MONTHS,
          notes: [item.name, item.spec, lot ? `LOT ${lot}` : null]
            .filter(Boolean)
            .join(' · '),
        },
        userId,
        line.id,
      );
    }
  }

  /** The patient a use went into, picked by name. */
  private async patientById(
    manager: EntityManager,
    id: string,
  ): Promise<string> {
    const patient = await manager
      .getRepository(Patient)
      .findOne({ where: { id }, select: { id: true } });
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);
    return patient.id;
  }

  /** The patient a use went into, by the file number staff read off the chart. */
  private async patientByFile(
    manager: EntityManager,
    fileNo: string,
  ): Promise<string> {
    const patient = await manager
      .getRepository(Patient)
      .findOne({ where: { fileNo }, select: { id: true } });
    if (!patient) {
      throw AppException.notFound(ErrorCode.PatientNotFound, { fileNo });
    }
    return patient.id;
  }

  /** Apply the item's own fields and refresh what is derived from them. */
  private assign(
    item: InventoryItem,
    dto: Partial<CreateInventoryItemDto>,
  ): void {
    if (dto.category !== undefined) item.category = dto.category;
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.brand !== undefined) item.brand = dto.brand ?? null;
    if (dto.spec !== undefined) item.spec = dto.spec ?? null;
    if (dto.unit !== undefined) item.unit = dto.unit;
    if (dto.minQuantity !== undefined) {
      item.minQuantity = dto.minQuantity ?? null;
    }
    if (dto.notes !== undefined) item.notes = dto.notes ?? null;
    // One spelling for a brand and one form for a size, however typed.
    item.brand = canonicalBrand(item.brand);
    item.spec = normalizeSpec(item.category, item.spec);
    item.identityKey = identityKey(item);
    item.searchText = itemSearchText(item);
  }

  private async refuseDuplicate(
    manager: EntityManager,
    item: InventoryItem,
  ): Promise<void> {
    const clash = await manager.getRepository(InventoryItem).findOne({
      where: {
        identityKey: item.identityKey,
        ...(item.id ? { id: Not(item.id) } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw AppException.conflict(ErrorCode.InventoryItemExists, {
        id: clash.id,
      });
    }
  }

  private toResponse(i: InventoryItem, now: Date): Record<string, unknown> {
    return {
      id: i.id,
      category: i.category,
      name: i.name,
      brand: i.brand,
      spec: i.spec,
      unit: i.unit,
      quantity: i.quantity,
      minQuantity: i.minQuantity,
      stockState: stockState(i.quantity, i.minQuantity),
      /** The first-expiring batch's, as printed on the pack. */
      expiry: i.expiryText,
      expiryState: expiryState(i.expiresOn, i.quantity, now),
      notes: i.notes,
      isArchived: i.deletedAt !== null,
      /** Optimistic-concurrency token; send back as `expectedVersion` on update. */
      version: i.version,
    };
  }
}
