import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PbIcon } from '../icon/icon';
import { isLineIcon } from '../icon/line-icons';

export type BannerTone = 'neutral' | 'warning' | 'error';
export type BannerSize = 'default' | 'compact';

/**
 * The app's one callout: a tonal box with a leading icon that says "read
 * this first" — a patient's medical history, a failed load, a sign-in error,
 * a register number that belongs to someone else. Each screen used to draw
 * its own, with its own padding, radius and icon size; this is that box once.
 *
 * Tonal, never outlined: the container colour carries the meaning, and the
 * tones follow the same fixed-hue status tokens as `pb-status-chip`.
 * `compact` is for a callout inside a card or list row.
 *
 * The role belongs to the caller — `role="alert"` for something that just
 * happened (a failed sign-in), `role="note"` for standing information — and
 * goes on the `<pb-banner>` element itself. An element marked
 * `pbBannerAction` is placed at the trailing edge, e.g. a retry button.
 */
@Component({
  selector: 'pb-banner',
  standalone: true,
  imports: [MatIconModule, PbIcon],
  host: {
    '[attr.data-tone]': 'tone()',
    '[attr.data-size]': 'size()',
  },
  template: `
    <div class="pb-banner__main">
      @if (icon(); as name) {
        @if (isLineIcon(name)) {
          <pb-icon class="pb-banner__icon pb-banner__icon--line" [name]="name" />
        } @else {
          <mat-icon class="pb-banner__icon" aria-hidden="true">{{ name }}</mat-icon>
        }
      }
      <div class="pb-banner__body">
        @if (title()) {
          <strong class="pb-banner__title">{{ title() }}</strong>
        }
        <ng-content />
      </div>
    </div>
    <div class="pb-banner__action"><ng-content select="[pbBannerAction]" /></div>
  `,
  styles: `
    :host {
      --_icon: var(--mat-sys-on-surface-variant);

      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: var(--pb-space-3);
      padding: var(--pb-space-3) var(--pb-space-4);
      border-radius: var(--mat-sys-corner-large);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium);
      line-height: 1.8;
    }

    :host([data-tone='warning']) {
      --_icon: currentColor;
      background: var(--pb-warning-container);
      color: var(--pb-on-warning-container);
    }

    :host([data-tone='error']) {
      --_icon: var(--mat-sys-error);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    :host([data-size='compact']) {
      gap: var(--pb-space-2);
      padding: var(--pb-space-2) var(--pb-space-3);
      border-radius: var(--mat-sys-corner-medium);
      font: var(--mat-sys-body-small);
      line-height: 1.7;
    }

    .pb-banner__icon {
      flex: 0 0 auto;
      font-size: var(--pb-icon-md);
      color: var(--_icon);
      /* Centre the glyph on the first line of text rather than the box. */
      margin-block-start: calc((1lh - 1em) / 2);
    }

    /* A line icon: drawn a touch smaller than the glyph, centred on the first line. */
    .pb-banner__icon--line {
      --pb-icon-size: 20px;

      margin-block-start: calc((1lh - var(--pb-icon-size)) / 2);
    }

    :host([data-size='compact']) .pb-banner__icon--line {
      --pb-icon-size: 18px;
    }

    :host([data-size='compact']) .pb-banner__icon {
      font-size: var(--pb-icon-sm);
    }

    /*
     * The icon and its text never part: only the action wraps, under them,
     * once the row is too narrow for both.
     */
    .pb-banner__main {
      display: flex;
      align-items: flex-start;
      gap: inherit;
      flex: 1 1 16rem;
      min-width: 0;
    }

    .pb-banner__body {
      flex: 1 1 0;
      min-width: 0;
    }

    .pb-banner__title {
      display: block;
      font-weight: 700;
    }

    .pb-banner__action {
      flex: 0 0 auto;
      align-self: center;
    }

    /* No action projected: take no room, and no gap beside it. */
    .pb-banner__action:empty {
      display: none;
    }
  `,
})
export class PbBanner {
  readonly tone = input<BannerTone>('neutral');
  readonly size = input<BannerSize>('default');
  readonly icon = input<string | null>(null);
  readonly title = input<string | null>(null);

  protected readonly isLineIcon = isLineIcon;
}
