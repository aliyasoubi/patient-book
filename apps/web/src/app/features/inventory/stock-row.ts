import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

import type { InventoryItem, InventoryMovementKind } from '../../core/models/common.model';
import {
  INVENTORY_CATEGORY_ICONS,
  INVENTORY_MOVEMENT_ICONS,
  inventoryMovementLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PbIcon } from '../../shared/ui/icon/icon';
import { PbIconButton } from '../../shared/ui/icon-button/icon-button';
import { InventoryExpiryPipe } from './inventory-expiry';

/** The rarer moves; use and receive have their own buttons on the row. */
const MENU_MOVES: readonly InventoryMovementKind[] = ['discard', 'count'];

/**
 * One item on the store's grid, in five columns that line up down the page:
 *
 *   item     a tile for its kind, the name, the brand and the size
 *   stock    the count, and a gauge against the minimum with a mark at it
 *   status   in stock, below the minimum, or out — a dot and a word
 *   expiry   the date of the nearest batch, coloured as it nears
 *   actions  use one / receive one, the rest in a menu
 *
 * Read-only staff get the history in place of the moves; the archive gets
 * a restore. Every action is handed back to the page, which owns the dialogs.
 */
@Component({
  selector: 'pb-stock-row',
  standalone: true,
  imports: [
    InventoryExpiryPipe,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    PersianNumberPipe,
    PbIcon,
    PbIconButton,
    TranslatePipe,
  ],
  host: {
    role: 'listitem',
    '[attr.data-stock]': 'item().stockState',
    '[attr.data-expiry]': 'item().expiryState',
  },
  templateUrl: './stock-row.html',
  styleUrl: './stock-row.scss',
})
export class StockRow {
  readonly item = input.required<InventoryItem>();
  /** May move stock and edit the item. */
  readonly canEdit = input(false);
  /** Listed from the archive: the one action is to restore it. */
  readonly archived = input(false);

  readonly moved = output<InventoryMovementKind>();
  readonly history = output<void>();
  readonly restore = output<void>();
  readonly edit = output<void>();
  readonly archive = output<void>();
  readonly addSimilar = output<void>();

  protected readonly menuMoves = MENU_MOVES;
  protected readonly moveIcons = INVENTORY_MOVEMENT_ICONS;
  protected readonly categoryIcons = INVENTORY_CATEGORY_ICONS;
  protected readonly unitLabel = inventoryUnitLabel;
  protected readonly moveLabel = inventoryMovementLabel;

  /**
   * The gauge runs to twice the minimum (or the count itself, if more), so
   * the minimum's mark sits in a steady place and "low" reads as under it.
   */
  protected readonly gauge = computed(() => {
    const { quantity, minQuantity } = this.item();
    if (minQuantity === null || minQuantity <= 0) return null;
    const scale = Math.max(minQuantity * 2, quantity, 1);
    return {
      fill: Math.round((quantity / scale) * 100),
      mark: Math.round((minQuantity / scale) * 100),
    };
  });

  protected readonly status = computed(() => {
    const item = this.item();
    if (item.stockState === 'out') return { key: 'inventory.stateOut', tone: 'out' };
    if (item.stockState === 'low') return { key: 'inventory.stateLow', tone: 'low' };
    if (item.minQuantity === null) return { key: 'inventory.stateNoMin', tone: 'quiet' };
    return { key: 'inventory.stateOk', tone: 'ok' };
  });
}
