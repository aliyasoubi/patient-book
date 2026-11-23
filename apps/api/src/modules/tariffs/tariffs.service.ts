import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';

import { Tariff } from './tariff.entity';
import { CreateTariffDto, UpdateTariffDto } from './dto/tariff.dto';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode, loosePersianKey } from '../../domain';

/** A price as the list shows it: one figure, or from one to another. */
export interface PriceRange {
  price: number | null;
  maxPrice: number | null;
}

/**
 * The price a line is saved with, or `null` when it is no price at all: a
 * top with nothing under it, or under its own bottom. A range from a figure
 * to itself is that one figure.
 */
export function priceRange({ price, maxPrice }: PriceRange): PriceRange | null {
  if (maxPrice === null) return { price, maxPrice };
  if (price === null || maxPrice < price) return null;
  return { price, maxPrice: maxPrice === price ? null : maxPrice };
}

/**
 * The clinic's price list for its services. Edits are versioned like every
 * other record; a removed line is gone from the list, and the audit log keeps
 * what it said.
 */
@Injectable()
export class TariffsService {
  constructor(
    @InjectRepository(Tariff) private readonly tariffs: Repository<Tariff>,
    private readonly audit: AuditService,
  ) {}

  /** Every line, in the practice's own order. */
  async list(): Promise<unknown[]> {
    const rows = await this.tariffs.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((t) => this.toResponse(t));
  }

  async create(dto: CreateTariffDto, userId: string | null): Promise<unknown> {
    return this.tariffs.manager.transaction(async (manager) => {
      const tariffs = manager.getRepository(Tariff);
      const tariff = tariffs.create({
        price: null,
        maxPrice: null,
        note: null,
      });
      await this.assign(manager, tariff, dto);
      tariff.sortOrder = ((await tariffs.maximum('sortOrder')) ?? 0) + 1;
      const saved = await tariffs.save(tariff);
      await this.audit.recordRequired(
        {
          userId,
          action: 'create',
          entity: 'tariff',
          entityId: saved.id,
          changes: { ...dto },
        },
        manager,
      );
      return this.toResponse(saved);
    });
  }

  async update(
    id: string,
    { expectedVersion, ...dto }: UpdateTariffDto,
    userId: string | null,
  ): Promise<unknown> {
    return this.tariffs.manager.transaction(async (manager) => {
      const tariff = await this.lock(manager, id);
      if (tariff.version !== expectedVersion) {
        throw AppException.conflict(ErrorCode.TariffModified);
      }
      await this.assign(manager, tariff, dto);
      const saved = await manager.getRepository(Tariff).save(tariff);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'tariff',
          entityId: id,
          changes: { ...dto },
        },
        manager,
      );
      return this.toResponse(saved);
    });
  }

  async remove(id: string, userId: string | null): Promise<void> {
    await this.tariffs.manager.transaction(async (manager) => {
      const tariff = await this.lock(manager, id);
      await manager.getRepository(Tariff).delete({ id });
      await this.audit.recordRequired(
        {
          userId,
          action: 'delete',
          entity: 'tariff',
          entityId: id,
          changes: {
            category: tariff.category,
            title: tariff.title,
            price: tariff.price,
            maxPrice: tariff.maxPrice,
          },
        },
        manager,
      );
    });
  }

  private async lock(manager: EntityManager, id: string): Promise<Tariff> {
    const tariff = await manager.getRepository(Tariff).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tariff) throw AppException.notFound(ErrorCode.TariffNotFound);
    return tariff;
  }

  /**
   * Apply what was sent. A category typed as another line already spells it
   * — «جراحي» for «جراحی» — takes that spelling, so the list keeps one
   * heading for it.
   */
  private async assign(
    manager: EntityManager,
    tariff: Tariff,
    dto: Partial<CreateTariffDto>,
  ): Promise<void> {
    const tariffs = manager.getRepository(Tariff);
    if (dto.category) {
      const key = loosePersianKey(dto.category);
      const headings = await tariffs
        .createQueryBuilder('t')
        .select('DISTINCT t.category', 'category')
        .getRawMany<{ category: string }>();
      tariff.category =
        headings.find((h) => loosePersianKey(h.category) === key)?.category ??
        dto.category;
    }
    if (dto.title) {
      tariff.title = dto.title;
      tariff.normalizedTitle = loosePersianKey(dto.title);
      const clash = await tariffs.findOne({
        where: {
          normalizedTitle: tariff.normalizedTitle,
          ...(tariff.id ? { id: Not(tariff.id) } : {}),
        },
        select: { id: true },
      });
      if (clash) {
        throw AppException.conflict(ErrorCode.TariffTitleTaken, {
          title: dto.title,
        });
      }
    }
    const range = priceRange({
      price: dto.price !== undefined ? dto.price : tariff.price,
      maxPrice: dto.maxPrice !== undefined ? dto.maxPrice : tariff.maxPrice,
    });
    if (!range) throw AppException.badRequest(ErrorCode.TariffRangeInvalid);
    tariff.price = range.price;
    tariff.maxPrice = range.maxPrice;
    if (dto.note !== undefined) tariff.note = dto.note ?? null;
  }

  private toResponse(t: Tariff): Record<string, unknown> {
    return {
      id: t.id,
      category: t.category,
      title: t.title,
      price: t.price,
      maxPrice: t.maxPrice,
      note: t.note,
      /** Optimistic-concurrency token; send back as `expectedVersion` on update. */
      version: t.version,
    };
  }
}
