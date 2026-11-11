import { Component, computed, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PersianCountPipe, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';

export interface DonutPart {
  key: string;
  /** An i18n key. */
  label: string;
  count: number;
}

/**
 * A share of a whole as a ring: each part an arc that sweeps in from the top
 * after the one before it, the total in the middle, a legend beside it.
 * Hovering a part (on the ring or in the legend) lifts it and puts its own
 * count in the middle.
 */
@Component({
  selector: 'pb-stats-donut',
  standalone: true,
  imports: [PersianCountPipe, PersianNumberPipe, TranslatePipe],
  template: `
    <div class="donut">
      <svg class="donut__ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="donut__track" cx="60" cy="60" r="50" />
        @for (arc of arcs(); track arc.key; let i = $index) {
          <circle
            class="donut__arc"
            [attr.data-part]="i"
            [class.is-dim]="active() !== null && active() !== arc.key"
            cx="60"
            cy="60"
            r="50"
            pathLength="100"
            [style.--_len]="arc.length"
            [style.--_i]="i"
            [attr.stroke-dashoffset]="-arc.offset"
            (pointerenter)="active.set(arc.key)"
            (pointerleave)="active.set(null)"
          />
        }
      </svg>
      <div class="donut__centre">
        @if (activeArc(); as a) {
          <strong>{{ a.count | faCount }}</strong>
          <span>{{ a.label | translate }}</span>
        } @else {
          <strong>{{ total() | faCount }}</strong>
          <span>{{ totalLabel() | translate }}</span>
        }
      </div>
    </div>

    <ul class="legend">
      @for (arc of arcs(); track arc.key; let i = $index) {
        <li
          class="legend__row"
          [attr.data-part]="i"
          [class.is-dim]="active() !== null && active() !== arc.key"
          (pointerenter)="active.set(arc.key)"
          (pointerleave)="active.set(null)"
        >
          <span class="legend__dot" aria-hidden="true"></span>
          <span class="legend__label">{{ arc.label | translate }}</span>
          <span class="legend__value">{{ arc.count | faCount }}</span>
          <span class="legend__share"
            >{{ arc.share | faNum }}{{ 'common.percentSign' | translate }}</span
          >
        </li>
      }
    </ul>
  `,
  styleUrl: './stats-donut.scss',
})
export class StatsDonut {
  readonly parts = input.required<readonly DonutPart[]>();
  /** What the middle says under the total (an i18n key). */
  readonly totalLabel = input.required<string>();

  protected readonly active = signal<string | null>(null);

  protected readonly total = computed(() => this.parts().reduce((sum, p) => sum + p.count, 0));

  /** Arcs in percent of the ring, a small gap left between neighbours. */
  protected readonly arcs = computed(() => {
    const total = this.total() || 1;
    const gap = this.parts().filter((p) => p.count > 0).length > 1 ? 1.5 : 0;
    let offset = 0;
    return this.parts().map((part) => {
      const share = (part.count / total) * 100;
      const arc = {
        ...part,
        share: Math.round(share),
        offset,
        length: Math.max(0, share - gap),
      };
      offset += share;
      return arc;
    });
  });

  protected readonly activeArc = computed(
    () => this.arcs().find((a) => a.key === this.active()) ?? null,
  );
}
