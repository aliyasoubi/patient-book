import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InventoryItem } from '../inventory/inventory-item.entity';
import { inventorySearchKey } from '../inventory/inventory-stock';
import {
  InventoryCategory,
  InventoryMovementKind,
  InventoryUnit,
  JalaliDate,
} from '../../domain';
import {
  ConsumptionMonth,
  ConsumptionMonths,
  consumptionWindow,
  monthlyAverage,
} from './material-consumption';

/** One item's row: the units used each month, in its own unit. */
export interface ItemConsumption {
  id: string;
  category: InventoryCategory;
  name: string;
  brand: string | null;
  spec: string | null;
  unit: InventoryUnit;
  /** No longer stocked; its usage still counts. */
  archived: boolean;
  /** Units used per month, in the order of {@link MaterialConsumption.months}. */
  used: number[];
  total: number;
  /** Over complete months only — see {@link monthlyAverage}. */
  monthlyAverage: number | null;
}

/** How much of each material the clinic used, month by month. */
export interface MaterialConsumption {
  months: ConsumptionMonth[];
  /** The day the first stock card line was written, `yyyy/MM/dd`; null with no stock on record. */
  trackedFrom: string | null;
  /** Items used at least once in the window, most used first. */
  items: ItemConsumption[];
}

/**
 * Material consumption: what left the shelves as "use" each Jalali month, per
 * item and in the item's own unit — a box of gloves and a cartridge are never
 * added together. Discards are waste, not consumption, and are left out; an
 * undone use is deleted from the stock card, so it never counts.
 */
@Injectable()
export class MaterialConsumptionService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
  ) {}

  async consumption(
    count: ConsumptionMonths,
    q?: string,
    now = new Date(),
  ): Promise<MaterialConsumption> {
    const [first] = await this.items.query<Array<{ at: Date | null }>>(
      `SELECT min("createdAt") AS at FROM inventory_movements`,
    );
    const trackedFrom = first?.at ? new Date(first.at) : null;
    const { months, starts, end } = consumptionWindow(now, count, trackedFrom);

    // Bucketed by the month starts worked out above, so a use at 23:30 on the
    // last day of a month counts in that month on the clinic's clock.
    const rows = await this.items.query<
      Array<{ itemId: string; bucket: number; used: number }>
    >(
      `SELECT m."itemId" AS "itemId",
              width_bucket(m."createdAt", $1::timestamptz[]) AS bucket,
              (-sum(m.change))::int AS used
         FROM inventory_movements m
        WHERE m.kind = $2 AND m."createdAt" >= $3 AND m."createdAt" < $4
        GROUP BY 1, 2`,
      [starts, InventoryMovementKind.Use, starts[0], end],
    );

    const usage = new Map<string, number[]>();
    for (const row of rows) {
      const used = usage.get(row.itemId) ?? new Array<number>(count).fill(0);
      used[row.bucket - 1] += row.used;
      usage.set(row.itemId, used);
    }
    const found = usage.size ? await this.usedItems([...usage.keys()], q) : [];

    const items = found
      .map((item): ItemConsumption => {
        const used = usage.get(item.id)!;
        return {
          id: item.id,
          category: item.category,
          name: item.name,
          brand: item.brand,
          spec: item.spec,
          unit: item.unit,
          archived: item.deletedAt !== null,
          used,
          total: used.reduce((sum, n) => sum + n, 0),
          monthlyAverage: monthlyAverage(used, months),
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fa'));

    return {
      months,
      trackedFrom: trackedFrom
        ? (JalaliDate.fromDate(trackedFrom)?.format() ?? null)
        : null,
      items,
    };
  }

  /** The items used, archived ones too, narrowed by the stock list's own search. */
  private usedItems(ids: string[], q?: string): Promise<InventoryItem[]> {
    const qb = this.items
      .createQueryBuilder('i')
      .withDeleted()
      .where('i.id = ANY(:ids)', { ids });
    const key = inventorySearchKey(q);
    if (key) {
      for (const [n, word] of key.split(' ').entries()) {
        qb.andWhere(`i."searchText" LIKE :w${n}`, { [`w${n}`]: `%${word}%` });
      }
    }
    return qb.getMany();
  }
}
