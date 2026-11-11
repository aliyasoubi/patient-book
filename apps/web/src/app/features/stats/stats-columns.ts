import { Component, computed, input } from '@angular/core';

import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';

export interface Column {
  key: string;
  /** Already translated. */
  label: string;
  count: number;
}

/**
 * Counts as upright columns on a shared baseline, rising one after another:
 * the tallest in the accent, the rest in a quiet graphite, each with its
 * count over it and its name under it. Hovering a column darkens it and
 * lifts its count.
 */
@Component({
  selector: 'pb-stats-columns',
  standalone: true,
  imports: [PersianCountPipe],
  template: `
    <ol class="cols" role="list">
      @for (c of columns(); track c.key; let i = $index) {
        <li class="cols__col" [class.is-lead]="c.count === max() && c.count > 0" [style.--_i]="i">
          <span class="cols__value">{{ c.count | faCount }}</span>
          <span class="cols__track">
            <span class="cols__bar" [style.block-size.%]="c.percent"></span>
          </span>
          <span class="cols__label">{{ c.label }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    @keyframes cols-rise {
      from {
        scale: 1 0;
      }
    }

    @keyframes cols-fade {
      from {
        opacity: 0;
        translate: 0 6px;
      }
    }

    :host {
      display: block;
    }

    .cols {
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      gap: var(--pb-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cols__col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--pb-space-2);
      min-inline-size: 0;
    }

    .cols__value {
      color: var(--pb-neutral-600);
      font-size: 0.8125rem;
      font-weight: 700;
      transition:
        color 160ms var(--pb-ease-standard),
        translate 260ms var(--pb-ease-spring);
      animation: cols-fade 400ms calc(500ms + var(--_i, 0) * 70ms) var(--pb-ease-standard) backwards;

      .cols__col:hover & {
        color: var(--pb-graphite);
        translate: 0 -3px;
      }
    }

    .cols__track {
      display: flex;
      align-items: flex-end;
      inline-size: 100%;
      max-inline-size: 32px;
      block-size: 150px;
      border-radius: 10px;
      background: var(--pb-neutral-100);
    }

    .cols__bar {
      inline-size: 100%;
      min-block-size: 4px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--pb-graphite) 24%, transparent);
      transform-origin: bottom;
      transition:
        background-color 200ms var(--pb-ease-standard),
        block-size 600ms var(--pb-ease-emphasized);
      animation: cols-rise 800ms calc(150ms + var(--_i, 0) * 70ms) var(--pb-ease-emphasized)
        backwards;

      .cols__col:hover & {
        background: color-mix(in srgb, var(--pb-graphite) 45%, transparent);
      }

      .is-lead & {
        background: var(--pb-brand);
      }
    }

    .cols__label {
      overflow: hidden;
      max-inline-size: 100%;
      color: var(--pb-neutral-500);
      font-size: 0.6875rem;
      text-align: center;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    @media (prefers-reduced-motion: reduce) {
      .cols__bar,
      .cols__value {
        animation: none;
      }
    }
  `,
})
export class StatsColumns {
  readonly items = input.required<readonly Column[]>();

  protected readonly max = computed(() => Math.max(0, ...this.items().map((c) => c.count)));

  protected readonly columns = computed(() => {
    const max = Math.max(1, this.max());
    return this.items().map((c) => ({ ...c, percent: Math.round((c.count / max) * 100) }));
  });
}
