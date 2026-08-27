import { Component, input } from '@angular/core';

/**
 * The title row at the top of every screen — a heading, an optional subtitle
 * or record count, and a primary action slot. Patients, the implant and
 * ortho registers, the surgery queue, settings and the dashboard all repeated
 * this same three-part layout by hand; this is that layout as one component.
 */
@Component({
  selector: 'pb-page-header',
  standalone: true,
  template: `
    <div class="pb-page-header__text">
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
    :host {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .pb-page-header__title-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      min-width: 0;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--mat-sys-on-surface);

      @media (max-width: 700px) {
        font-size: 1.25rem;
      }
    }

    .pb-page-header__count {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .pb-page-header__subtitle {
      margin: 4px 0 0;
      max-width: 68ch;
      font-size: 0.8125rem;
      line-height: 1.8;
      color: var(--mat-sys-on-surface-variant);
    }

    .pb-page-header__actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
  `,
})
export class PbPageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** Pre-formatted, e.g. "۱٬۶۵۶ پرونده" — callers keep their own count pipes. */
  readonly count = input<string | null>(null);
}
