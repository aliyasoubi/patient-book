import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '@ngx-translate/core';

import { InventoryService } from '../../core/services/inventory.service';
import type { InventoryItem, InventoryItemDetail } from '../../core/models/common.model';
import { LoadError } from '../../shared/components/load-error';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import {
  INVENTORY_MOVEMENT_ICONS,
  inventoryMovementLabel,
  inventoryUnitLabel,
} from '../../shared/labels';
import { PbButton } from '../../shared/ui';

/**
 * An item's stock card (کاردکس): every delivery, use, discard and count,
 * newest first, with who recorded it and the balance it left. Read-only — a
 * line is never changed; a wrong one is put right by a count.
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
        <ul class="lines">
          @for (m of d.movements; track m.id) {
            <li class="line" [attr.data-kind]="m.kind">
              <mat-icon class="line__icon" aria-hidden="true">{{ icons[m.kind] }}</mat-icon>
              <div class="line__body">
                <span class="line__what">
                  <strong>{{ kindLabel(m.kind) | translate }}</strong>
                  @if (m.kind === 'count') {
                    {{
                      'inventoryHistory.countedTo' | translate: { count: (m.quantityAfter | faNum) }
                    }}
                  } @else {
                    <span class="line__change" dir="ltr">{{ signed(m.change) | faNum }}</span>
                  }
                  @if (m.expiry) {
                    <span class="line__meta">{{
                      'inventory.expiresOn' | translate: { date: (m.expiry | faNum) }
                    }}</span>
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
      width: min(560px, 84vw);
    }
    .lines {
      margin: 0;
      padding: 0;
      list-style: none;
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
      align-items: baseline;
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

  protected readonly icons = INVENTORY_MOVEMENT_ICONS;
  protected readonly kindLabel = inventoryMovementLabel;
  protected readonly unitLabel = inventoryUnitLabel;
  protected readonly label = [this.item.name, this.item.brand, this.item.spec]
    .filter(Boolean)
    .join(' · ');

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

  /** `+10`, `−3`: which way the stock went, read left to right. */
  protected signed(change: number): string {
    return change > 0 ? `+${change}` : change < 0 ? `−${-change}` : '0';
  }
}
