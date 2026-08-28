import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink, type Params } from '@angular/router';
import { MatButtonModule, type MatButtonAppearance } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type ButtonVariant = 'flat' | 'stroked' | 'text';
export type ButtonSize = 'default' | 'large';
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
 * leading-edge spacing that belongs to the icon slot. That costs one repeated
 * block, which is why only the label — the part that carries projected
 * content, and so can exist only once — still goes through the template.
 *
 * Passing `routerLink` or `href` renders an `<a>` instead of a `<button>` — a
 * "New patient" action or a "Call" link is a real navigation the user can
 * middle-click or open in a new tab, which only an anchor supports; a
 * `<button>` with a click handler that calls the router or sets
 * `location.href` does not.
 */
@Component({
  selector: 'pb-button',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, NgTemplateOutlet, RouterLink],
  host: {
    '[class.pb-button--full]': 'fullWidth()',
    '[class.pb-button--large]': "size() === 'large'",
  },
  template: `
    @if (isLink()) {
      <a
        [matButton]="appearance()"
        [routerLink]="routerLink()"
        [attr.href]="href()"
        [queryParams]="queryParams()"
        class="pb-btn"
        [class.pb-btn--full]="fullWidth()"
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
      @if (loading() && loadingText()) {
        <span>{{ loadingText() }}</span>
      } @else {
        <ng-content />
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
      margin-inline-end: 8px;
      --mat-progress-spinner-active-indicator-color: currentColor;
    }
  `,
})
export class PbButton {
  readonly variant = input<ButtonVariant>('flat');
  readonly size = input<ButtonSize>('default');
  readonly type = input<'button' | 'submit'>('button');
  readonly icon = input<string | null>(null);
  readonly disabled = input(false);
  /** True while the action this button triggers is in flight. Implies disabled. */
  readonly loading = input(false);
  /** Replaces the label while `loading()` is true, e.g. "در حال ذخیره…". */
  readonly loadingText = input('');
  /** Stretches to the width of its container — the login screen's sign-in button. */
  readonly fullWidth = input(false);
  /** Renders an `<a>` navigating here instead of a `<button>`. */
  readonly routerLink = input<ButtonRouterLink | null>(null);
  readonly queryParams = input<Params | null>(null);
  /** Renders an `<a>` to a plain URL — `tel:`, `mailto:`, an external link. */
  readonly href = input<string | null>(null);

  protected readonly appearance = computed(() => APPEARANCE[this.variant()]);
  protected readonly isDisabled = computed(() => this.disabled() || this.loading());
  protected readonly isLink = computed(() => this.routerLink() !== null || this.href() !== null);
}
