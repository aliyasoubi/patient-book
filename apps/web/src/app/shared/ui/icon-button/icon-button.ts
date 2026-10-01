import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink, type UrlTree } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { type MatMenuPanel, MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

export type IconButtonVariant = 'standard' | 'tonal';
export type IconButtonSize = 'default' | 'compact';
type RouterLinkValue = string | readonly unknown[] | UrlTree;

/**
 * A button that is only an icon: a row's "⋮" menu, back, edit-in-place,
 * call. An icon alone names nothing, so `ariaLabel` is required.
 *
 * - `standard` is M3's standard icon button (no container); `tonal` fills it
 *   with primary-container, for the one action a card offers on its own —
 *   calling the patient.
 * - `compact` is 32px for an action inside a line of body text, where a 48px
 *   target would make the row twice as tall as its text.
 * - `link` (a router link, named so to stay clear of the `RouterLink`
 *   directive's selector — see `PbButton`) or `href` render an anchor;
 *   `menu` makes it the trigger for a `<mat-menu>` the caller keeps in its
 *   own template.
 *
 * The menu trigger is its own branch rather than a `[matMenuTriggerFor]`
 * bound to null: the trigger directive is matched by the attribute's
 * presence and would still stamp `aria-expanded="false"` on a plain button.
 */
@Component({
  selector: 'pb-icon-button',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    NgTemplateOutlet,
    RouterLink,
  ],
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
  },
  template: `
    @if (link() !== null) {
      <a
        mat-icon-button
        [routerLink]="link()"
        [attr.aria-label]="ariaLabel()"
        [matTooltip]="tooltip()"
      >
        <ng-container [ngTemplateOutlet]="glyph" />
      </a>
    } @else if (href() !== null) {
      <a mat-icon-button [href]="href()" [attr.aria-label]="ariaLabel()" [matTooltip]="tooltip()">
        <ng-container [ngTemplateOutlet]="glyph" />
      </a>
    } @else if (menu(); as panel) {
      <button
        mat-icon-button
        type="button"
        [matMenuTriggerFor]="panel"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [matTooltip]="tooltip()"
      >
        <ng-container [ngTemplateOutlet]="glyph" />
      </button>
    } @else {
      <button
        mat-icon-button
        type="button"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [matTooltip]="tooltip()"
      >
        <ng-container [ngTemplateOutlet]="glyph" />
      </button>
    }

    <ng-template #glyph>
      <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
    </ng-template>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
    }

    :host([data-variant='tonal']) {
      --mat-icon-button-icon-color: var(--mat-sys-on-primary-container);
      --mat-icon-button-state-layer-color: var(--mat-sys-on-primary-container);

      .mat-mdc-icon-button {
        background: var(--mat-sys-primary-container);
      }
    }

    :host([data-size='compact']) {
      --mat-icon-button-state-layer-size: 32px;
      --mat-icon-button-icon-size: var(--pb-icon-sm);

      .mat-mdc-icon-button {
        padding: calc((32px - var(--pb-icon-sm)) / 2);
      }

      mat-icon {
        font-size: var(--pb-icon-sm);
      }
    }
  `,
})
export class PbIconButton {
  readonly icon = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly tooltip = input('');
  readonly variant = input<IconButtonVariant>('standard');
  readonly size = input<IconButtonSize>('default');
  readonly disabled = input(false);
  readonly link = input<RouterLinkValue | null>(null);
  readonly href = input<string | null>(null);
  readonly menu = input<MatMenuPanel | null>(null);
}
