import { NgTemplateOutlet } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, type Params } from '@angular/router';
import { MatButtonModule, type MatButtonAppearance } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map, of, switchMap } from 'rxjs';

export type ButtonVariant = 'flat' | 'stroked' | 'text';
export type ButtonSize = 'default' | 'large';
export type ButtonTone = 'default' | 'danger';
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
 * The icon is written directly inside the anchor and the button rather than
 * routed through the label's `ng-template`. Material decides which of its
 * content slots an element belongs to from the static markup, so an icon
 * arriving through `ngTemplateOutlet` lands in the generic slot and loses the
 * leading-edge spacing that belongs to the icon slot. That costs a repeated
 * block per element, which is why only the label — the part that carries
 * projected content, and so can exist only once — still goes through the
 * template.
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
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    NgTemplateOutlet,
    RouterLink,
  ],
  host: {
    '[class.pb-button--full]': 'fullWidth()',
    '[class.pb-button--large]': "size() === 'large'",
    '[class.pb-button--danger]': "tone() === 'danger'",
    '[class.pb-button--collapsed]': 'collapsed()',
  },
  template: `
    @if (link() !== null) {
      <a
        [matButton]="appearance()"
        [routerLink]="isDisabled() ? null : link()"
        [queryParams]="queryParams()"
        class="pb-btn"
        [class.pb-btn--full]="fullWidth()"
        [class.pb-btn--disabled]="isDisabled()"
        [attr.aria-disabled]="isDisabled() ? 'true' : null"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="ariaExpanded()"
        [attr.tabindex]="isDisabled() ? -1 : null"
        [matTooltip]="tooltip()"
        (click)="isDisabled() && $event.preventDefault()"
      >
        @if (loading()) {
          <mat-progress-spinner
            mode="indeterminate"
            diameter="18"
            strokeWidth="2.5"
            class="pb-btn__spinner"
            aria-hidden="true"
          />
        } @else if (icon()) {
          <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
        }
        <ng-container [ngTemplateOutlet]="label" />
      </a>
    } @else if (href() !== null) {
      <a
        [matButton]="appearance()"
        [attr.href]="isDisabled() ? null : href()"
        class="pb-btn"
        [class.pb-btn--full]="fullWidth()"
        [class.pb-btn--disabled]="isDisabled()"
        [attr.aria-disabled]="isDisabled() ? 'true' : null"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="ariaExpanded()"
        [attr.tabindex]="isDisabled() ? -1 : null"
        [matTooltip]="tooltip()"
        (click)="isDisabled() && $event.preventDefault()"
      >
        @if (loading()) {
          <mat-progress-spinner
            mode="indeterminate"
            diameter="18"
            strokeWidth="2.5"
            class="pb-btn__spinner"
            aria-hidden="true"
          />
        } @else if (icon()) {
          <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
        }
        <ng-container [ngTemplateOutlet]="label" />
      </a>
    } @else {
      <button
        [matButton]="appearance()"
        [type]="type()"
        [disabled]="isDisabled()"
        class="pb-btn"
        [class.pb-btn--full]="fullWidth()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="ariaExpanded()"
        [matTooltip]="tooltip()"
      >
        @if (loading()) {
          <mat-progress-spinner
            mode="indeterminate"
            diameter="18"
            strokeWidth="2.5"
            class="pb-btn__spinner"
            aria-hidden="true"
          />
        } @else if (icon()) {
          <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
        }
        <ng-container [ngTemplateOutlet]="label" />
      </button>
    }

    <ng-template #label>
      <!-- Collapsed, the label is clipped rather than removed, so it still
           names the button for a screen reader; the icon is aria-hidden. -->
      <span [class.visually-hidden]="collapsed()">
        @if (loading() && loadingText()) {
          {{ loadingText() }}
        } @else {
          <ng-content />
        }
      </span>
      @if (badge(); as count) {
        <span class="pb-btn__badge">{{ count }}</span>
      }
    </ng-template>
  `,
  styles: `
    /*
     * A plain inline box, not \`display: contents\`. Contents-display hosts
     * expose their children directly to the parent's layout, which sounds
     * appealing for a thin wrapper — but combined with the comment-node
     * anchors Angular's control flow (@if) leaves in the DOM, it produced a
     * real bug here: the flex-laid-out button pair in the form's action row
     * collapsed onto each other, one of them measuring a negative x position.
     * A normal inline-block host has no such surprise and still sizes to its
     * content.
     */
    :host {
      display: inline-block;
    }
    :host(.pb-button--full) {
      display: block;
      width: 100%;
    }
    .pb-btn--full {
      width: 100%;
    }
    :host(.pb-button--large) .pb-btn {
      height: var(--pb-control-height);
      font-size: var(--mat-sys-title-medium-size);
    }
    .pb-btn__spinner {
      display: inline-flex;
      margin-inline-end: var(--pb-space-2);
      --mat-progress-spinner-active-indicator-color: currentColor;
    }

    /* A light press-in gives tap feedback beyond Material's ripple alone. */
    .pb-btn {
      transition: transform 120ms var(--pb-ease-spring);
    }
    .pb-btn:active {
      transform: scale(0.96);
    }

    /*
     * Material's own \`[disabled]\` only exists on <button>; an <a> has no such
     * attribute, so a disabled/loading link previously stayed fully clickable.
     * link/href are already cleared above — this just matches Material's
     * visual disabled state and blocks hover/selection on the anchor.
     */
    .pb-btn--disabled {
      pointer-events: none;
      opacity: 0.38;
    }

    /*
     * Icon-only: with the label clipped, Material's icon-to-label spacing
     * would push the icon off-centre, so it goes to zero and the padding
     * evens out around the glyph. 48px is the touch-target floor.
     */
    :host(.pb-button--collapsed) .pb-btn {
      --mat-button-filled-horizontal-padding: var(--pb-space-3);
      --mat-button-filled-icon-spacing: 0;
      --mat-button-filled-icon-offset: 0;
      --mat-button-outlined-horizontal-padding: var(--pb-space-3);
      --mat-button-outlined-icon-spacing: 0;
      --mat-button-outlined-icon-offset: 0;
      --mat-button-text-with-icon-horizontal-padding: var(--pb-space-3);
      --mat-button-text-icon-spacing: 0;
      --mat-button-text-icon-offset: 0;
      min-width: 48px;
    }

    /*
     * Destructive actions take the error role. Overriding each appearance's
     * own tokens rather than \`color\` recolours the hover/focus/pressed state
     * layers along with the label, instead of leaving them keyed to primary.
     */
    :host(.pb-button--danger) .pb-btn {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
      --mat-button-filled-state-layer-color: var(--mat-sys-on-error);
      --mat-button-filled-ripple-color: color-mix(
        in srgb,
        var(--mat-sys-on-error) 12%,
        transparent
      );
      --mat-button-outlined-label-text-color: var(--mat-sys-error);
      --mat-button-outlined-state-layer-color: var(--mat-sys-error);
      --mat-button-outlined-ripple-color: color-mix(in srgb, var(--mat-sys-error) 12%, transparent);
      --mat-button-text-label-text-color: var(--mat-sys-error);
      --mat-button-text-state-layer-color: var(--mat-sys-error);
      --mat-button-text-ripple-color: color-mix(in srgb, var(--mat-sys-error) 12%, transparent);
    }

    /* A count on the button itself, e.g. active filters — stays visible when
       the label collapses, since it is the part that changes. */
    .pb-btn__badge {
      display: inline-grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      margin-inline-start: var(--pb-space-2);
      padding-inline: var(--pb-space-1);
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font: var(--mat-sys-label-small);
      font-weight: 700;
      letter-spacing: var(--mat-sys-label-small-tracking);
    }
  `,
})
export class PbButton {
  private readonly breakpoints = inject(BreakpointObserver);

  readonly variant = input<ButtonVariant>('flat');
  readonly size = input<ButtonSize>('default');
  readonly type = input<'button' | 'submit'>('button');
  readonly icon = input<string | null>(null);
  readonly disabled = input(false);
  /** `danger` takes the error colour — delete, archive, clear. */
  readonly tone = input<ButtonTone>('default');
  /** True while the action this button triggers is in flight. Implies disabled. */
  readonly loading = input(false);
  /** Replaces the label while `loading()` is true, e.g. "در حال ذخیره…". */
  readonly loadingText = input('');
  /** Stretches to the width of its container — the login screen's sign-in button. */
  readonly fullWidth = input(false);
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
