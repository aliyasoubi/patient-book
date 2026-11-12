import { NgTemplateOutlet } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, type Params } from '@angular/router';
import { MatButtonModule, type MatButtonAppearance } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map, of, switchMap } from 'rxjs';

import { PbIcon } from '../icon/icon';
import { isLineIcon } from '../icon/line-icons';

export type ButtonVariant = 'flat' | 'stroked' | 'text';
export type ButtonSize = 'default' | 'large';
export type ButtonTone = 'default' | 'danger' | 'neutral';
export type ButtonRouterLink = string | readonly unknown[];

/** The app's vocabulary, in Material 3's terms. */
const APPEARANCE: Record<ButtonVariant, MatButtonAppearance> = {
  flat: 'filled',
  stroked: 'outlined',
  text: 'text',
};

/**
 * Every action button in the app — submit, cancel, "new patient", "sign in".
 *
 * Material 22 exposes the button's appearance as a real input (`matButton`),
 * so one element covers every variant; earlier versions matched each variant
 * as its own attribute directive at compile time, which is why this used to
 * be six near-identical branches.
 *
 * The icon and the label travel together as one "face", rendered once from
 * the `body` template in all three elements. It sits in Material's generic
 * content slot rather than the icon slot, so its spacing and icon size are
 * set in button.scss; in return the face can slide out as a whole while a
 * three-dot loader slides into the same cell (`loading`), with no layout
 * shift and no label showing mid-load.
 *
 * Passing `link` or `href` renders an `<a>` instead of a `<button>` — a
 * "New patient" action or a "Call" link is a real navigation the user can
 * middle-click or open in a new tab, which only an anchor supports; a
 * `<button>` with a click handler that calls the router or sets
 * `location.href` does not.
 *
 * The two anchors are separate branches, not one anchor with both bindings.
 * `RouterLink` host-binds `attr.href` to the URL it computes, and with no
 * route that is `null` — so a `tel:` href set by the template was removed
 * again by the directive on the same element, and the Call button rendered
 * with no destination at all.
 *
 * The route input is `link`, not `routerLink`: a page that imports
 * `RouterLink` for its own anchors would otherwise match the directive on
 * `<pb-button routerLink>` itself too — giving the wrapper its own
 * `tabindex="0"` (a second tab stop) and a click handler that still navigated
 * when the button was disabled.
 *
 * Everything that has to land on the real control — its accessible name, the
 * tooltip, the colour tokens — is applied here, not by the caller: the host
 * is only a wrapper, and a `color`, `padding` or `aria-*` set on it never
 * reaches the button inside.
 */
@Component({
  selector: 'pb-button',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, NgTemplateOutlet, RouterLink, PbIcon],
  host: {
    '[class.pb-button--full]': 'fullWidth()',
    '[class.pb-button--large]': "size() === 'large'",
    '[class.pb-button--danger]': "tone() === 'danger'",
    '[class.pb-button--neutral]': "tone() === 'neutral'",
    '[class.pb-button--collapsed]': 'collapsed()',
    '[class.pb-button--forward]': 'forward()',
    '[class.pb-button--raised]': 'raised()',
    '[class.pb-button--shrinks]': 'shrinkWhileLoading()',
  },
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class PbButton {
  private readonly breakpoints = inject(BreakpointObserver);

  readonly variant = input<ButtonVariant>('flat');
  readonly size = input<ButtonSize>('default');
  readonly type = input<'button' | 'submit'>('button');
  readonly icon = input<string | null>(null);
  readonly disabled = input(false);
  /** `danger` takes the error colour — delete, archive, clear; `neutral` is graphite, for the quiet way out beside a primary action. */
  readonly tone = input<ButtonTone>('default');
  /** True while the action this button triggers is in flight. Implies disabled. */
  readonly loading = input(false);
  /** Replaces the label while `loading()` is true, e.g. "در حال ذخیره…". */
  readonly loadingText = input('');
  /** Stretches to the width of its container — the login screen's sign-in button. */
  readonly fullWidth = input(false);
  /** The icon points where the action leads (continue, sign in) and leans that way on hover. */
  readonly forward = input(false);
  /** A soft shadow under the screen's one main action (`--pb-shadow-*`). */
  readonly raised = input(false);
  /**
   * While loading, narrow to a pill that just holds the three dots, centred,
   * and widen back after — for a full-width main action, where the shrink
   * itself says "working on it".
   */
  readonly shrinkWhileLoading = input(false);
  /** Renders an `<a>` navigating here (a router link) instead of a `<button>`. */
  readonly link = input<ButtonRouterLink | null>(null);
  readonly queryParams = input<Params | null>(null);
  /** Renders an `<a>` to a plain URL — `tel:`, `mailto:`, an external link. */
  readonly href = input<string | null>(null);
  /** Accessible name when the visible label alone doesn't say enough. */
  readonly ariaLabel = input<string | null>(null);
  /** For a button that shows and hides a panel. */
  readonly ariaExpanded = input<boolean | null>(null);
  readonly tooltip = input('');
  /** A short count shown after the label, pre-formatted (Persian digits). */
  readonly badge = input<string | null>(null);
  /**
   * Viewport width in px at and below which the label is hidden and the
   * button shows its icon alone. Needs an `icon`.
   */
  readonly collapseBelow = input<number | null>(null);

  protected readonly appearance = computed(() => APPEARANCE[this.variant()]);
  /** A hyphenated name is a line icon (`pb-icon`); anything else is a Material Symbol. */
  protected readonly lineIcon = computed(() => {
    const name = this.icon();
    return name && isLineIcon(name) ? name : null;
  });
  protected readonly isDisabled = computed(() => this.disabled() || this.loading());

  protected readonly collapsed = toSignal(
    toObservable(this.collapseBelow).pipe(
      switchMap((px) =>
        px === null
          ? of(false)
          : this.breakpoints.observe(`(max-width: ${px}px)`).pipe(map((state) => state.matches)),
      ),
    ),
    { initialValue: false },
  );
}
