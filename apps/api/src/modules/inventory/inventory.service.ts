import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { format as formatJalali } from 'date-fns-jalali';
import { EntityManager, Not, Repository } from 'typeorm';

import { InventoryItem } from './inventory-item.entity';
import { InventoryMovement } from './inventory-movement.entity';
import {
  CreateInventoryItemDto,
  InventoryMovementDto,
  QueryInventoryDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';
import {
  applyMovement,
  expiryHorizon,
  expirySoonSql,
  expiryState,
  identityKey,
  inventorySearchKey,
  itemSearchText,
  parseExpiry,
  reorderSql,
  stockState,
} from './inventory-stock';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
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
 * through {@link move}, which locks the item, applies the rule in
 * `inventory-stock.ts`, and writes the line on the stock card in the same
 * transaction — the card is the stock's audit trail, so a movement writes no
 * separate audit row. Edits, archiving and restoring do.
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
    private readonly audit: AuditService,
  ) {}

  async list(dto: QueryInventoryDto): Promise<PageResult<unknown>> {
    const qb = this.items
      .createQueryBuilder('i')
      .skip(dto.skip)
      .take(dto.limit);
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

    const [items, total] = await qb.getManyAndCount();
    const now = new Date();
    return PageResult.of(
      items.map((i) => this.toResponse(i, now)),
      total,
      dto,
    );
  }

  /** One item, with its stock card newest first. */
  async findOne(id: string): Promise<unknown> {
    const item = await this.items.findOne({ where: { id }, withDeleted: true });
    if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
    const movements = await this.items.query<
      Array<
        InventoryMovement & { fullName: string | null; account: string | null }
      >
    >(
      `SELECT m.*, u."fullName", u.username AS account
         FROM inventory_movements m
         LEFT JOIN users u ON u.id = m."userId"
        WHERE m."itemId" = $1
        ORDER BY m."createdAt" DESC, m.id
        LIMIT ${HISTORY_LIMIT}`,
      [id],
    );
    return {
      ...this.toResponse(item, new Date()),
      movements: movements.map((m) => ({
        id: m.id,
        kind: m.kind,
        change: m.change,
        quantityAfter: m.quantityAfter,
        expiry: m.expiryText,
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
      // The opening balance is the item's first count, so its stock card
      // adds up from the very first line.
      if (dto.quantity) {
        await this.record(manager, saved, userId, {
          kind: InventoryMovementKind.Count,
          quantity: dto.quantity,
        });
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
      const item = await items.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
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
   * lock makes two at once queue rather than both read the same balance.
   */
  async move(
    id: string,
    dto: InventoryMovementDto,
    userId: string | null,
  ): Promise<unknown> {
    await this.items.manager.transaction(async (manager) => {
      const item = await manager.getRepository(InventoryItem).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw AppException.notFound(ErrorCode.InventoryItemNotFound);
      await this.record(manager, item, userId, dto);
    });
    return this.findOne(id);
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

  /** Apply a movement to a locked item and write its line on the stock card. */
  private async record(
    manager: EntityManager,
    item: InventoryItem,
    userId: string | null,
    dto: Pick<InventoryMovementDto, 'kind' | 'quantity'> &
      Partial<InventoryMovementDto>,
  ): Promise<void> {
    const expiry = parseExpiry(dto.expiry);
    const result = applyMovement(item, {
      kind: dto.kind,
      quantity: dto.quantity,
      expiry,
    });
    await manager.getRepository(InventoryItem).update(item.id, {
      quantity: result.quantity,
      expiresOn: result.expiresOn,
      expiryText: result.expiryText,
      version: () => '"version" + 1',
    });
    const movements = manager.getRepository(InventoryMovement);
    await movements.save(
      movements.create({
        itemId: item.id,
        kind: dto.kind,
        change: result.change,
        quantityAfter: result.quantity,
        expiryText: expiry?.text ?? null,
        note: dto.note ?? null,
        userId,
      }),
    );
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
    if (dto.expiry !== undefined) {
      const expiry = parseExpiry(dto.expiry);
      item.expiresOn = expiry?.date ?? null;
      item.expiryText = expiry?.text ?? null;
    }
    if (dto.notes !== undefined) item.notes = dto.notes ?? null;
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
      /** As printed on the pack, in its own calendar. */
      expiry: i.expiryText,
      expiryState: expiryState(i.expiresOn, i.quantity, now),
      notes: i.notes,
      isArchived: i.deletedAt !== null,
      /** Optimistic-concurrency token; send back as `expectedVersion` on update. */
      version: i.version,
    };
  }
}
