import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

/**
 * The app's one tag/chip primitive — status labels, record metadata, brand
 * tags, and, with `link` set, a tappable link to another record. Every
 * hand-rolled pill used to size and colour itself separately; this is the
 * single place that decides what a "tag" looks like.
 *
 * Two looks, following M3's chip family: a static label is a tonal pill (the
 * status colour carries the meaning), while a link is an **assist chip** —
 * outlined on the surface with its icon in primary. Tonal fill on something
 * tappable would read as a *selected* filter chip, not as "go there". Both
 * share one 28px height.
 */
@Component({
  selector: 'pb-status-chip',
  standalone: true,
  imports: [MatIconModule, NgTemplateOutlet, RouterLink],
  template: `
    @if (link()) {
      <a class="pb-status-chip__link" [routerLink]="link()">
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
      --_bg: var(--pb-neutral-100, var(--mat-sys-surface-container-high));
      --_edge: transparent;

      gap: 6px;
      min-height: 28px;
      padding-inline: 10px;
      border: 1px solid var(--_edge);
      border-radius: 9px;
      background: var(--_bg);
      color: var(--pb-neutral-600, var(--mat-sys-on-surface-variant));
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
    }

    .pb-status-chip__icon {
      inline-size: 16px;
      block-size: 16px;
      font-size: 16px;
      font-variation-settings: 'wght' 400;
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
      gap: var(--pb-space-2);
      padding-inline: var(--pb-space-3);
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

    /* Tones are a soft tint with a hairline of the same hue: the meaning
       reads at a glance without a block of colour in every row. */
    :host([data-tone='primary']) {
      --_bg: color-mix(in srgb, var(--pb-brand, #ff6a00) 9%, var(--pb-surface));
      --_edge: color-mix(in srgb, var(--pb-brand, #ff6a00) 22%, transparent);
      color: var(--pb-brand-strong, var(--mat-sys-primary));
    }

    :host([data-tone='success']) {
      --_bg: color-mix(in srgb, var(--pb-success) 9%, var(--pb-surface));
      --_edge: color-mix(in srgb, var(--pb-success) 22%, transparent);
      color: var(--pb-success-ink);
    }

    :host([data-tone='warning']) {
      --_bg: color-mix(in srgb, var(--pb-warn) 10%, var(--pb-surface));
      --_edge: color-mix(in srgb, var(--pb-warn) 26%, transparent);
      color: var(--pb-warn-ink);
    }

    :host([data-tone='error']) {
      --_bg: color-mix(in srgb, var(--pb-danger) 8%, var(--pb-surface));
      --_edge: color-mix(in srgb, var(--pb-danger) 22%, transparent);
      color: var(--pb-danger-ink);
    }
  `,
})
export class PbStatusChip {
  /** Colour of a static label; ignored on a link chip, which is always outlined. */
  readonly tone = input<StatusTone | null>(null);
  readonly icon = input<string | null>(null);
  /** Renders as a real `<a>` (middle-click, open-in-new-tab all work) instead of a static pill. */
  readonly link = input<string | readonly unknown[] | null>(null);

  /** A link chip is drawn as an outlined assist chip; `tone` only colours static labels. */
  protected readonly effectiveTone = computed(() => this.tone() ?? 'neutral');
}
