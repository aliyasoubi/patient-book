import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { PersianCountPipe } from '../../pipes/persian-number.pipe';

export type StatTileTone = 'neutral' | 'warn';

/**
 * One number with its icon and label — the dashboard's work tiles and the
 * statistics page's totals. With `link` set the whole tile opens the list
 * the number counts, so a tile should link to exactly those rows.
 *
 * `warn` is a request, not a colour: the tile turns to the error container
 * only while there is something to act on, so a zero never shouts.
 */
@Component({
  selector: 'pb-stat-tile',
  standalone: true,
  imports: [MatIconModule, NgTemplateOutlet, PersianCountPipe, RouterLink],
  template: `
    @if (link(); as link) {
      <a class="pb-stat-tile__body" [routerLink]="link" [queryParams]="queryParams()">
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <div class="pb-stat-tile__body">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }

    <ng-template #content>
      <mat-icon class="pb-stat-tile__icon" aria-hidden="true">{{ icon() }}</mat-icon>
      <span class="pb-stat-tile__value">{{ value() | faCount }}</span>
      <span class="pb-stat-tile__label">{{ label() }}</span>
    </ng-template>
  `,
  host: {
    class: 'pb-stat-tile',
    '[class.pb-stat-tile--warn]': 'warn()',
  },
  styles: `
    @use '../../../../styles/surface';

    :host {
      display: block;
      min-width: 0;
    }

    .pb-stat-tile__body {
      @include surface.outlined;

      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      height: 100%;
      padding: var(--pb-space-4);
      text-decoration: none;
      color: inherit;
      transition:
        border-color 160ms ease,
        transform 160ms ease;
    }

    a.pb-stat-tile__body:hover {
      border-color: var(--mat-sys-primary);
      transform: translateY(-2px);
    }

    .pb-stat-tile__icon {
      font-size: var(--pb-icon-md);
      color: var(--mat-sys-primary);
      margin-bottom: var(--pb-space-1);
    }

    .pb-stat-tile__value {
      font-size: var(--mat-sys-headline-medium-size);
      font-weight: 700;
      line-height: 1.15;
    }

    .pb-stat-tile__label {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    :host(.pb-stat-tile--warn) {
      .pb-stat-tile__body {
        border-color: color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }

      .pb-stat-tile__icon {
        color: var(--mat-sys-error);
      }

      .pb-stat-tile__label {
        color: inherit;
        opacity: 0.85;
      }
    }
  `,
})
export class PbStatTile {
  /** Already translated. */
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input.required<string>();
  /** The list the number counts; without it the tile is a plain figure. */
  readonly link = input<string | null>(null);
  readonly queryParams = input<Record<string, string> | null>(null);
  readonly tone = input<StatTileTone>('neutral');

  protected readonly warn = computed(() => this.tone() === 'warn' && this.value() > 0);
}
