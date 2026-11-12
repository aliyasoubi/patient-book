import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import { PbIcon } from '../icon/icon';
import { lineIconFor } from '../icon/line-icons';

export interface FilterChipOption {
  value: string;
  label: string;
  icon?: string;
  /** Resolve `label` as an i18n key. Dynamic API-provided labels leave this false. */
  translate?: boolean;
}

/**
 * The toggles above a list that narrow what it shows — "unlinked only",
 * "follow-up overdue", a set of treatments, one category.
 *
 * `multiple` makes every chip independent; without it the chips are one
 * question with one answer, and tapping the chosen chip clears it back to
 * "everything". Either way the selection travels as a list of values.
 *
 * Drawn in the brand: white pills on a hairline. A chosen chip fills with a
 * tint of the accent and its icon gives way to a check that slides in, so
 * the change reads at a glance and nothing jumps.
 */
@Component({
  selector: 'pb-filter-chips',
  standalone: true,
  imports: [MatIconModule, PbIcon, TranslatePipe],
  template: `
    <div class="chips" role="group" [attr.aria-label]="ariaLabel()">
      @for (option of options(); track option.value) {
        <button
          type="button"
          class="chip"
          [class.is-on]="isSelected(option.value)"
          [attr.aria-pressed]="isSelected(option.value)"
          (click)="toggle(option.value)"
        >
          <span class="chip__lead" aria-hidden="true">
            <span class="chip__check"><pb-icon name="check" [size]="15" [stroke]="2.4" /></span>
            @if (option.icon) {
              <span class="chip__icon">
                @if (lineIcon(option.icon); as line) {
                  <pb-icon [name]="line" [size]="16" />
                } @else {
                  <mat-icon>{{ option.icon }}</mat-icon>
                }
              </span>
            }
          </span>
          <span class="chip__label">{{
            option.translate ? (option.label | translate) : option.label
          }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--pb-space-2);
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--pb-space-2);
      /* A row that sets --pb-chip-height (beside a search box) gets chips of its height. */
      block-size: var(--pb-chip-height, 36px);
      padding-inline: var(--pb-space-3) 14px;
      border: 1px solid color-mix(in srgb, var(--pb-neutral-300, #c9cdd3) 80%, transparent);
      border-radius: 999px;
      background: var(--pb-surface);
      color: var(--pb-neutral-600, var(--mat-sys-on-surface-variant));
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition:
        background-color 200ms var(--pb-ease-standard),
        border-color 200ms var(--pb-ease-standard),
        color 200ms var(--pb-ease-standard),
        box-shadow 220ms var(--pb-ease-standard),
        scale 160ms var(--pb-ease-standard);

      &:hover {
        color: var(--pb-graphite, var(--mat-sys-on-surface));
        box-shadow: var(--pb-shadow-sm);
      }

      &:active {
        scale: 0.97;
      }

      &:focus-visible {
        outline: 2px solid var(--pb-brand, var(--mat-sys-primary));
        outline-offset: 2px;
      }

      &.is-on {
        border-color: color-mix(in srgb, var(--pb-brand) 35%, transparent);
        background: color-mix(in srgb, var(--pb-brand) 10%, var(--pb-surface));
        color: var(--pb-brand-strong, var(--mat-sys-primary));
      }
    }

    /* The icon and the check share one cell and trade places. */
    .chip__lead {
      display: inline-grid;
      place-items: center;

      > * {
        grid-area: 1 / 1;
        display: inline-grid;
        place-items: center;
        transition:
          opacity 180ms var(--pb-ease-standard),
          scale 320ms var(--pb-ease-spring);
      }
    }

    .chip__check {
      opacity: 0;
      scale: 0.4;

      .is-on & {
        opacity: 1;
        scale: 1;
      }
    }

    .chip__icon {
      .is-on & {
        opacity: 0;
        scale: 0.4;
      }

      .mat-icon {
        inline-size: 16px;
        block-size: 16px;
        font-size: 16px;
        font-variation-settings: 'wght' 300;
      }
    }

    /* A chip with no icon makes room for its check only when chosen. */
    .chip__lead:not(:has(.chip__icon)) {
      inline-size: 0;
      margin-inline-end: calc(-1 * var(--pb-space-2));
      transition:
        inline-size 260ms var(--pb-ease-emphasized),
        margin 260ms var(--pb-ease-emphasized);

      .is-on & {
        inline-size: 15px;
        margin-inline-end: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chip,
      .chip__lead,
      .chip__lead > * {
        transition-duration: 0ms;
      }
    }
  `,
})
export class PbFilterChips {
  readonly options = input.required<readonly FilterChipOption[]>();
  readonly selected = input<readonly string[]>([]);
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input.required<string>();
  readonly selectedChange = output<string[]>();

  private readonly selectedSet = computed(() => new Set(this.selected()));

  protected readonly lineIcon = lineIconFor;

  protected isSelected(value: string): boolean {
    return this.selectedSet().has(value);
  }

  protected toggle(value: string): void {
    const on = this.isSelected(value);
    if (this.multiple()) {
      // Kept in the options' order, whatever order they were tapped in.
      const next = new Set(this.selected());
      if (on) next.delete(value);
      else next.add(value);
      this.selectedChange.emit(
        this.options()
          .map((o) => o.value)
          .filter((v) => next.has(v)),
      );
    } else {
      this.selectedChange.emit(on ? [] : [value]);
    }
  }
}
