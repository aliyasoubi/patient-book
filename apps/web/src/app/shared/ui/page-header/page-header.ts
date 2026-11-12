import { Component, input, output } from '@angular/core';

import { PbIcon } from '../icon/icon';

/**
 * The title row at the top of every screen — a heading, an optional subtitle
 * or record count, and a primary action slot. Patients, the implant and
 * ortho registers, the surgery queue, settings and the dashboard all repeated
 * this same three-part layout by hand; this is that layout as one component.
 */
@Component({
  selector: 'pb-page-header',
  standalone: true,
  imports: [PbIcon],
  template: `
    <div class="pb-page-header__text">
      <!-- The way back, named, over the title it leaves: a crumb, not a lone arrow. -->
      @if (backLabel(); as label) {
        <button type="button" class="pb-page-header__back" (click)="back.emit()">
          <pb-icon name="chevron-right" [size]="16" />
          <span>{{ label }}</span>
        </button>
      }
      <div class="pb-page-header__title-row">
        <h1>{{ title() }}</h1>
        @if (count()) {
          <span class="pb-page-header__count">{{ count() }}</span>
        }
      </div>
      @if (subtitle()) {
        <p class="pb-page-header__subtitle">{{ subtitle() }}</p>
      }
    </div>
    <div class="pb-page-header__actions">
      <ng-content />
    </div>
  `,
  styles: `
    @use '../../../../styles/type';

    :host {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--pb-space-3);
      flex-wrap: wrap;
    }

    .pb-page-header__back {
      display: inline-flex;
      align-items: center;
      gap: var(--pb-space-1);
      margin-block-end: var(--pb-space-2);
      margin-inline-start: calc(-1 * var(--pb-space-2));
      padding: var(--pb-space-1) var(--pb-space-2) var(--pb-space-1) var(--pb-space-3);
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--pb-neutral-500);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        background-color 180ms var(--pb-ease-standard),
        color 180ms var(--pb-ease-standard);

      pb-icon {
        transition: translate 220ms var(--pb-ease-spring);
      }

      &:hover {
        background: color-mix(in srgb, var(--pb-neutral-300) 40%, transparent);
        color: var(--pb-graphite);

        pb-icon {
          translate: 3px 0;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--pb-brand);
        outline-offset: 2px;
      }
    }

    .pb-page-header__text {
      flex: 1 1 240px;
      min-width: 0;
    }

    .pb-page-header__title-row {
      display: flex;
      align-items: baseline;
      gap: var(--pb-space-3);
      min-width: 0;
    }

    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
      font-weight: 700;
      color: var(--mat-sys-on-surface);

      @media (max-width: 700px) {
        font-size: var(--mat-sys-title-large-size);
      }
    }

    .pb-page-header__count {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .pb-page-header__subtitle {
      @include type.supporting-text;

      margin-top: var(--pb-space-1);
      max-width: 68ch;
    }

    .pb-page-header__actions {
      display: flex;
      align-items: center;
      gap: var(--pb-space-2);
      flex: 0 0 auto;
    }
  `,
})
export class PbPageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** Where back goes, by name — «لابراتوار», «انبار» — shown over the title. */
  readonly backLabel = input<string | null>(null);
  readonly back = output<void>();
  /** Pre-formatted, e.g. "۱٬۶۵۶ پرونده" — callers keep their own count pipes. */
  readonly count = input<string | null>(null);
}
