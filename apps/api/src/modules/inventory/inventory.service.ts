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
import { ErrorCode, InventoryMovementKind, InventoryUnit } from '../../domain';

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
          break;
        case InventoryMovementKind.Count:
          changes = count(lots, dto.quantity);
          break;
      }
      const patientId =
        dto.kind === InventoryMovementKind.Use && dto.patientFileNo
          ? await this.patientByFile(manager, dto.patientFileNo)
          : null;
      await writeMovement(manager, item, dto.kind, changes, {
        userId,
        note: dto.note,
        patientId,
      });
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
          await writeMovement(
            manager,
            item,
            InventoryMovementKind.Count,
            count(lots, line.quantity),
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
