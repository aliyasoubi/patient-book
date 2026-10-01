import { Component, input, output } from '@angular/core';

import { PbIconButton } from '../icon-button/icon-button';

/**
 * The title row at the top of every screen — a heading, an optional subtitle
 * or record count, and a primary action slot. Patients, the implant and
 * ortho registers, the surgery queue, settings and the dashboard all repeated
 * this same three-part layout by hand; this is that layout as one component.
 */
@Component({
  selector: 'pb-page-header',
  standalone: true,
  imports: [PbIconButton],
  template: `
    @if (backLabel(); as label) {
      <pb-icon-button
        class="pb-page-header__back"
        icon="arrow_forward"
        (click)="back.emit()"
        [ariaLabel]="label"
      />
    }
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
    @use '../../../../styles/type';

    :host {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--pb-space-3);
      flex-wrap: wrap;
    }

    .pb-page-header__back {
      margin-top: calc(-1 * var(--pb-space-2));
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
  readonly backLabel = input<string | null>(null);
  readonly back = output<void>();
  /** Pre-formatted, e.g. "۱٬۶۵۶ پرونده" — callers keep their own count pipes. */
  readonly count = input<string | null>(null);
}
