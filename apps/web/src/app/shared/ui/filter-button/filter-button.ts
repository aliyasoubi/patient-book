import { Component, input, output } from '@angular/core';

import { PbIcon } from '../icon/icon';

/**
 * The button that opens a list's filter panel, drawn as the search box's twin
 * — same height, corners, hairline and shadow — so the two read as one bar.
 * How many filters are set shows as a small count; while the panel is open
 * the button holds its focused look and its chevron turns.
 */
@Component({
  selector: 'pb-filter-button',
  standalone: true,
  imports: [PbIcon],
  host: { '[class.is-collapsible]': 'collapseBelow() > 0' },
  template: `
    <button
      type="button"
      class="fb"
      [class.is-open]="open()"
      [class.is-set]="count() > 0"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="openToggle.emit()"
    >
      <pb-icon class="fb__icon" name="adjustments-horizontal" [size]="20" />
      <span class="fb__label"><ng-content /></span>
      @if (count() > 0) {
        <span class="fb__count">{{ countText() || count() }}</span>
      }
      <pb-icon class="fb__chevron" name="chevron-down" [size]="16" />
    </button>
  `,
  styles: `
    @use '../../../../styles/field';

    :host {
      display: inline-flex;
      flex: 0 0 auto;
    }

    .fb {
      @include field.box;

      gap: var(--pb-space-2);
      padding-inline: var(--pb-space-4) var(--pb-space-3);
      color: var(--pb-graphite);
      font: inherit;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;

      &:focus-visible {
        outline: none;
        border-color: var(--_ring);
        box-shadow: var(--pb-shadow-md);
      }

      /* Open: the focused look of a field, held while its panel is out. */
      &.is-open {
        border-color: var(--_ring);
        box-shadow: var(--pb-shadow-md);
      }
    }

    .fb__icon {
      @include field.icon;

      .is-open &,
      .is-set & {
        color: var(--pb-brand);
      }
    }

    .fb__count {
      display: inline-grid;
      place-items: center;
      min-inline-size: 20px;
      block-size: 20px;
      padding-inline: 6px;
      border-radius: 999px;
      background: var(--pb-brand);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 800;
      line-height: 1;
      animation: fb-pop 280ms var(--pb-ease-spring);
    }

    .fb__chevron {
      color: var(--pb-neutral-400);
      transition: rotate 300ms var(--pb-ease-spring);

      .is-open & {
        rotate: 180deg;
      }
    }

    @keyframes fb-pop {
      from {
        scale: 0.4;
        opacity: 0;
      }
    }

    /* Narrow: the icon (and the count) carry it; the words go. */
    @media (max-width: 560px) {
      :host(.is-collapsible) .fb__label,
      :host(.is-collapsible) .fb__chevron {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fb__count {
        animation: none;
      }
    }
  `,
})
export class PbFilterButton {
  readonly open = input(false);
  readonly count = input(0);
  /** The count as shown (Persian digits). */
  readonly countText = input('');
  /** Needed when the label is hidden on narrow screens. */
  readonly ariaLabel = input('');
  /** Below this viewport width only the icon shows. */
  readonly collapseBelow = input(0);
  readonly openToggle = output<void>();
}
