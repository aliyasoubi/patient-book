import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

/**
 * The app's one tag/chip primitive — status labels, record metadata, brand
 * tags, and, with `routerLink` set, a tappable link to another record. Every
 * hand-rolled pill used to size and colour itself separately; this is the
 * single place that decides what a "tag" looks like.
 *
 * Two looks, following M3's chip family: a static label is a tonal pill (the
 * status colour carries the meaning), while a link is an **assist chip** —
 * outlined on the surface with its icon in primary. Tonal fill on something
 * tappable would read as a *selected* filter chip, not as "go there". Both
 * share M3's 32dp height and label-large type.
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
      gap: 8px;
      min-height: 32px;
      padding-inline: 12px;
      border: 1px solid transparent;
      border-radius: var(--mat-sys-corner-small);
      background: var(--_bg);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
      letter-spacing: var(--mat-sys-label-large-tracking);
      line-height: 1;
      white-space: nowrap;
    }

    .pb-status-chip__icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
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
      gap: 8px;
      padding-inline: 12px;
      color: inherit;
      text-decoration: none;
    }

    /* Assist chip: outlined, text on-surface, icon in primary; hover is the
       M3 on-surface state layer rather than a tint of the container. */
    :host(:has(.pb-status-chip__link)) {
      --_bg: transparent;
      border-color: var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface);
    }

    :host(:has(.pb-status-chip__link)) .pb-status-chip__icon {
      color: var(--mat-sys-primary);
    }

    :host(:has(.pb-status-chip__link:hover)) {
      --_bg: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }

    :host(:has(.pb-status-chip__link:focus-visible)) {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    :host([data-tone='primary']) {
      --_bg: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    /* Fixed-hue app tokens, not brand roles: see styles.scss. */
    :host([data-tone='success']) {
      --_bg: var(--pb-success-container);
      color: var(--pb-on-success-container);
    }

    :host([data-tone='warning']) {
      --_bg: var(--pb-warning-container);
      color: var(--pb-on-warning-container);
    }

    :host([data-tone='error']) {
      --_bg: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class PbStatusChip {
  /** Colour of a static label; ignored on a link chip, which is always outlined. */
  readonly tone = input<StatusTone | null>(null);
  readonly icon = input<string | null>(null);
  /** Renders as a real `<a>` (middle-click, open-in-new-tab all work) instead of a static pill. */
  readonly routerLink = input<string | readonly unknown[] | null>(null);

  /** A link chip is drawn as an outlined assist chip; `tone` only colours static labels. */
  protected readonly effectiveTone = computed(() => this.tone() ?? 'neutral');
}
