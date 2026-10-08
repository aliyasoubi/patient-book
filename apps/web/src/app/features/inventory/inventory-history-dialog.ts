import { Component, inject, signal } from '@angular/core';
import {
  MatDialog,
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { InventoryService } from '../../core/services/inventory.service';
import type {
  ExpiryState,
  InventoryItem,
  InventoryItemDetail,
  InventoryLot,
} from '../../core/models/common.model';
import { LoadError } from '../../shared/components/load-error';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  expiryLabel,
  INVENTORY_MOVEMENT_ICONS,
  inventoryMovementLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import { PbButton, PbIconButton, PbStatusChip } from '../../shared/ui';
import type { StatusTone } from '../../shared/ui';
import { InventoryLotDialog, type InventoryLotDialogData } from './inventory-lot-dialog';

const EXPIRY_TONE: Record<ExpiryState, StatusTone> = {
  ok: 'neutral',
  expiring: 'warning',
  expired: 'error',
};

/**
 * An item's stock card (کاردکس): the batches on the shelf, first-expiring
 * first, then every delivery, use, discard and count, newest first — which
 * batch each moved, the patient a use went into, who recorded it and the
 * balance it left. A line is never changed; a wrong one is put right by a
 * count. A batch's lot number or expiry typed wrong can be corrected here.
 */
@Component({
  selector: 'pb-inventory-history-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
    LoadError,
    PersianNumberPipe,
    PbButton,
    PbIconButton,
    PbStatusChip,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'inventoryHistory.title' | translate }}
      <small dir="auto">{{ label }}</small>
    </h2>
    <mat-dialog-content class="card">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @if (failed()) {
        <pb-load-error [message]="'inventoryHistory.loadFailed' | translate" (retry)="load()" />
      }
      @if (detail(); as d) {
        @if (d.lots.length) {
          <h3 class="card__heading">{{ 'inventoryHistory.lots' | translate }}</h3>
          <ul class="lots">
            @for (lot of d.lots; track lot.id) {
              <li class="lot">
                <span class="lot__number" dir="ltr">{{
                  lot.lotNumber ?? ('inventoryMove.noLotNumber' | translate)
                }}</span>
                @if (lot.expiry) {
                  <pb-status-chip [tone]="expiryTone(lot)" icon="event">
                    {{ expiryLabel(lot.expiryState) | translate: { date: (lot.expiry | faNum) } }}
                  </pb-status-chip>
                }
                <span class="lot__quantity">
                  {{ lot.quantity | faNum }}
                  <small>{{ unitLabel(d.unit) | translate }}</small>
                </span>
                @if (canEdit) {
                  <pb-icon-button
                    icon="edit"
                    size="compact"
                    [ariaLabel]="'inventoryLot.title' | translate"
                    [tooltip]="'inventoryLot.title' | translate"
                    (click)="editLot(lot)"
                  />
                }
              </li>
            }
          </ul>
          <h3 class="card__heading">{{ 'inventoryHistory.lines' | translate }}</h3>
        }
        <ul class="lines">
          @for (m of d.movements; track m.id) {
            <li class="line" [attr.data-kind]="m.kind">
              <mat-icon class="line__icon" aria-hidden="true">{{ icons[m.kind] }}</mat-icon>
              <div class="line__body">
                <span class="line__what">
                  <strong>{{ kindLabel(m.kind) | translate }}</strong>
                  @if (m.change === 0) {
                    <span class="line__meta">{{ 'inventoryHistory.confirmed' | translate }}</span>
                  } @else {
                    <span class="line__change" dir="ltr">{{ signed(m.change) | faNum }}</span>
                  }
                  @if (m.lotNumber) {
                    <span class="line__meta">{{
                      'inventoryHistory.lot' | translate: { lot: m.lotNumber }
                    }}</span>
                  }
                  @if (m.expiry) {
                    <span class="line__meta">{{
                      'inventory.expiresOn' | translate: { date: (m.expiry | faNum) }
                    }}</span>
                  }
                  @if (m.patient; as patient) {
                    <pb-status-chip icon="person" [link]="['/patients', patient.id]">
                      {{ 'inventoryHistory.patient' | translate: { fileNo: patient.fileNo } }}
                    </pb-status-chip>
                  }
                </span>
                @if (m.note) {
                  <span class="line__note" dir="auto">{{ m.note }}</span>
                }
                <span class="line__meta">
                  {{ m.at | faNum }}
                  @if (m.by) {
                    · {{ m.by }}
                  }
                </span>
              </div>
              <span class="line__balance">
                {{ m.quantityAfter | faNum }}
                <small>{{ unitLabel(d.unit) | translate }}</small>
              </span>
            </li>
          } @empty {
            <li class="lines__empty">{{ 'inventoryHistory.empty' | translate }}</li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()">
        {{ 'action.dismiss' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    h2 small {
      display: block;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .card {
      width: min(600px, 84vw);
    }
    .card__heading {
      margin: var(--pb-space-3) 0 var(--pb-space-1);
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .lots,
    .lines {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .lot {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--pb-space-2) var(--pb-space-3);
      padding: var(--pb-space-2) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .lot__number {
      font-weight: 600;
      font-feature-settings: var(--pb-font-numeric);
    }
    .lot__quantity {
      margin-inline-start: auto;
      font-weight: 600;
      font-feature-settings: var(--pb-font-numeric);

      small {
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .line {
      display: flex;
      align-items: flex-start;
      gap: var(--pb-space-3);
      padding: var(--pb-space-3) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);

      &:last-child {
        border-bottom: none;
      }
    }
    .line__icon {
      flex: 0 0 auto;
      font-size: var(--pb-icon-sm);
      color: var(--mat-sys-on-surface-variant);
    }
    [data-kind='receive'] .line__icon {
      color: var(--pb-on-success-container);
    }
    [data-kind='discard'] .line__icon {
      color: var(--mat-sys-error);
    }
    .line__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
    }
    .line__what {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--pb-space-2);
    }
    .line__change {
      font-weight: 600;
      font-feature-settings: var(--pb-font-numeric);
    }
    .line__note {
      font: var(--mat-sys-body-medium);
    }
    .line__meta {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .line__balance {
      flex: 0 0 auto;
      font-weight: 600;
      font-feature-settings: var(--pb-font-numeric);

      small {
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .lines__empty {
      padding: var(--pb-space-4) 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class InventoryHistoryDialog {
  protected readonly ref = inject<MatDialogRef<InventoryHistoryDialog>>(MatDialogRef);
  private readonly item = inject<InventoryItem>(MAT_DIALOG_DATA);
  private readonly inventory = inject(InventoryService);
  private readonly dialog = inject(MatDialog);

  protected readonly canEdit = inject(AuthService).can('editInventory');
  protected readonly icons = INVENTORY_MOVEMENT_ICONS;
  protected readonly kindLabel = inventoryMovementLabel;
  protected readonly unitLabel = inventoryUnitLabel;
  protected readonly expiryLabel = expiryLabel;
  protected readonly label = [this.item.name, this.item.brand, this.item.spec]
    .filter(Boolean)
    .join(' · ');

  /** A batch was corrected, so the list's expiry may be out of date. */
  changed = false;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly detail = signal<InventoryItemDetail | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.inventory.get(this.item.id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  protected expiryTone(lot: InventoryLot): StatusTone {
    return EXPIRY_TONE[lot.expiryState ?? 'ok'];
  }

  protected editLot(lot: InventoryLot): void {
    const data: InventoryLotDialogData = { itemId: this.item.id, lot };
    this.dialog
      .open(InventoryLotDialog, { data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.detail.set(saved);
        this.changed = true;
      });
  }

  /** `+10`, `−3`: which way the stock went, read left to right. */
  protected signed(change: number): string {
    return change > 0 ? `+${change}` : `−${-change}`;
  }
}
