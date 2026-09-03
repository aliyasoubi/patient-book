import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

/**
 * The app's one tag/chip primitive — status labels, record metadata, brand
 * tags, and, with `routerLink` set, a tappable link to another record (an
 * M3 assist chip). Every hand-rolled pill used to size and colour itself
 * separately; this is the single place that decides what a "tag" looks like.
 */
@Component({
  selector: 'pb-status-chip',
  standalone: true,
  imports: [MatIconModule, NgTemplateOutlet, RouterLink],
  template: `
    @if (routerLink()) {
      <a class="pb-status-chip__link" [routerLink]="routerLink()">
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <ng-container [ngTemplateOutlet]="content" />
    }

    <ng-template #content>
      @if (icon()) {
        <mat-icon class="pb-status-chip__icon" aria-hidden="true">{{ icon() }}</mat-icon>
      }
      <ng-content />
    </ng-template>
  `,
  host: {
    class: 'pb-status-chip',
    '[attr.data-tone]': 'effectiveTone()',
  },
  styles: `
    :host {
      --_bg: var(--mat-sys-surface-container-high);

      display: inline-flex;
      align-items: center;
      /*
       * A flex item stretches to fill its container's cross axis by default —
       * fine in a row (that's just height), but a *column* flex parent
       * (registry rows stack name/link/etc. vertically) would stretch this to
       * the full row width instead of hugging its content. width: fit-content
       * keeps the chip content-sized inside either kind of parent.
       */
      width: fit-content;
      gap: 5px;
      min-height: 28px;
      padding-inline: 10px;
      border-radius: var(--mat-sys-corner-full);
      background: var(--_bg);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
      letter-spacing: var(--mat-sys-label-medium-tracking);
      line-height: 1;
      white-space: nowrap;
    }

    .pb-status-chip__icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /*
     * A link chip moves the padding onto the anchor, so the anchor's own box
     * — not the host's — is what's actually clickable/focusable. An anchor
     * sized via \`display: contents\` looked simpler, but Chrome and Safari
     * exclude \`display: contents\` elements from focus entirely: the chip
     * would have been clickable yet unreachable by keyboard.
     */
    :host(:has(.pb-status-chip__link)) {
      padding-inline: 0;
    }

    .pb-status-chip__link {
      display: inline-flex;
      align-items: center;
      align-self: stretch;
      gap: 5px;
      padding-inline: 10px;
      color: inherit;
      text-decoration: none;
    }

    :host(:has(.pb-status-chip__link:hover)) {
      filter: brightness(0.94);
    }

    :host(:has(.pb-status-chip__link:focus-visible)) {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    :host([data-tone='primary']) {
      --_bg: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    :host([data-tone='success']) {
      --_bg: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    :host([data-tone='warning']) {
      --_bg: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    :host([data-tone='error']) {
      --_bg: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class PbStatusChip {
  /** Leave unset to get 'primary' on a link chip, 'neutral' otherwise — see `effectiveTone`. */
  readonly tone = input<StatusTone | null>(null);
  readonly icon = input<string | null>(null);
  /** Renders as a real `<a>` (middle-click, open-in-new-tab all work) instead of a static pill. */
  readonly routerLink = input<string | readonly unknown[] | null>(null);

  /**
   * A link chip left at the default tone would be colour-identical to every
   * inert label around it — nothing marks it as tappable. Defaulting it to
   * 'primary' gives clickable chips a distinct colour without every call site
   * having to remember to set one; an explicit `tone` still wins.
   */
  protected readonly effectiveTone = computed(
    () => this.tone() ?? (this.routerLink() ? 'primary' : 'neutral'),
  );
}
