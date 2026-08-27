import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink, type Params } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type ButtonVariant = 'flat' | 'stroked' | 'text';
export type ButtonRouterLink = string | readonly unknown[];

/**
 * Every action button in the app — submit, cancel, "new patient", "sign in".
 *
 * Angular Material's button variants (`mat-flat-button`, `mat-stroked-button`,
 * `mat-button`) are attribute directives matched at template-compile time, so
 * one component cannot switch between them by binding an attribute at
 * runtime — hence the literal branches below, each wearing the real Material
 * directive. This is still one component from the call site's point of view:
 * `<pb-button variant="stroked">`, not several different tags to remember, and
 * the one place to change what "every submit button" looks like or how it
 * shows a loading state.
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
  imports: [MatButtonModule, MatProgressSpinnerModule, NgTemplateOutlet, RouterLink],
  host: {
    '[class.pb-button--full]': 'fullWidth()',
  },
  template: `
    @if (isLink()) {
      @switch (variant()) {
        @case ('stroked') {
          <a mat-stroked-button [routerLink]="routerLink()" [attr.href]="href()" [queryParams]="queryParams()" class="pb-btn" [class.pb-btn--full]="fullWidth()">
            <ng-container [ngTemplateOutlet]="content" />
          </a>
        }
        @case ('text') {
          <a mat-button [routerLink]="routerLink()" [attr.href]="href()" [queryParams]="queryParams()" class="pb-btn" [class.pb-btn--full]="fullWidth()">
            <ng-container [ngTemplateOutlet]="content" />
          </a>
        }
        @default {
          <a mat-flat-button [routerLink]="routerLink()" [attr.href]="href()" [queryParams]="queryParams()" class="pb-btn" [class.pb-btn--full]="fullWidth()">
            <ng-container [ngTemplateOutlet]="content" />
          </a>
        }
      }
    } @else {
      @switch (variant()) {
        @case ('stroked') {
          <button
            mat-stroked-button
            [type]="type()"
            [disabled]="isDisabled()"
            class="pb-btn"
            [class.pb-btn--full]="fullWidth()">
            <ng-container [ngTemplateOutlet]="content" />
          </button>
        }
        @case ('text') {
          <button
            mat-button
            [type]="type()"
            [disabled]="isDisabled()"
            class="pb-btn"
            [class.pb-btn--full]="fullWidth()">
            <ng-container [ngTemplateOutlet]="content" />
          </button>
        }
        @default {
          <button
            mat-flat-button
            [type]="type()"
            [disabled]="isDisabled()"
            class="pb-btn"
            [class.pb-btn--full]="fullWidth()">
            <ng-container [ngTemplateOutlet]="content" />
          </button>
        }
      }
    }

    <ng-template #content>
      @if (loading()) {
        <mat-progress-spinner
          mode="indeterminate"
          diameter="18"
          strokeWidth="2.5"
          class="pb-btn__spinner"
          aria-hidden="true" />
        @if (loadingText()) {
          <span>{{ loadingText() }}</span>
        }
      } @else {
        @if (icon()) {
          <span class="material-symbols-rounded pb-btn__icon" aria-hidden="true">{{ icon() }}</span>
        }
        <ng-content />
      }
    </ng-template>
  `,
  styles: `
    /*
     * A plain inline box, not \`display: contents\`. Contents-display hosts
     * expose their children directly to the parent's layout, which sounds
     * appealing for a thin wrapper — but combined with the comment-node
     * anchors Angular's control flow (@switch/@if) leaves in the DOM, it
     * produced a real bug here: the flex-laid-out button pair in the form's
     * action row collapsed onto each other, one of them measuring a negative
     * x position. A normal inline-block host has no such surprise and still
     * sizes to its content.
     */
    :host {
      display: inline-block;
    }
    :host(.pb-button--full) {
      display: block;
      width: 100%;
    }
    .pb-btn {
      gap: 8px;
    }
    .pb-btn--full {
      width: 100%;
    }
    .pb-btn__icon {
      font-size: 20px;
    }
    .pb-btn__spinner {
      display: inline-flex;
      /* Spins in place of the icon; Material tints it via currentColor. */
      ::ng-deep circle {
        stroke: currentColor;
      }
    }
  `,
})
export class PbButton {
  readonly variant = input<ButtonVariant>('flat');
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

  protected readonly isDisabled = computed(() => this.disabled() || this.loading());
  protected readonly isLink = computed(() => this.routerLink() !== null || this.href() !== null);
}
