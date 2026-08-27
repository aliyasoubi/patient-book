import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * The bordered, rounded panel every page is built from — a form section, a
 * dashboard chart, a detail-page card. Every screen in this app used to
 * define its own `.panel`/`.card`/`.section` CSS for what is visually one
 * pattern; this is that pattern as a single component, so its radius,
 * border, and header layout change in one place.
 */
@Component({
  selector: 'pb-surface',
  standalone: true,
  imports: [MatIconModule],
  template: `
    @if (title()) {
      <header class="pb-surface__header">
        @if (icon()) {
          <mat-icon class="pb-surface__icon" aria-hidden="true">{{ icon() }}</mat-icon>
        }
        <h2 class="pb-surface__title">{{ title() }}</h2>
        @if (hint()) {
          <span class="pb-surface__hint">{{ hint() }}</span>
        }
      </header>
    }
    <div class="pb-surface__body">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 18px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-large);
      background: var(--mat-sys-surface);

      @media (max-width: 700px) {
        padding: 14px;
      }
    }

    :host(.pb-surface--flush) {
      padding: 0;
      overflow: hidden;
    }

    :host(.pb-surface--low) {
      background: var(--mat-sys-surface-container-low);
    }

    .pb-surface__header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 14px;
    }

    :host(.pb-surface--flush) .pb-surface__header {
      margin: 18px 18px 0;
    }

    .pb-surface__icon {
      font-size: 19px;
      color: var(--mat-sys-primary);
      align-self: center;
    }

    .pb-surface__title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .pb-surface__hint {
      margin-inline-start: auto;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    :host(.pb-surface--flush) .pb-surface__body {
      padding: 18px;
    }
  `,
})
export class PbSurface {
  readonly title = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly hint = input<string | null>(null);
}
