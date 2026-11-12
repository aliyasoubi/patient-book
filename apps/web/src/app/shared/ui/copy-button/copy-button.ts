import { MatTooltipModule } from '@angular/material/tooltip';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';

import { PbIcon } from '../icon/icon';

/**
 * A square button that copies `value`. Pressed, its copy icon turns into a
 * tick — the one spins out as the other springs in — and after a couple of
 * seconds turns back, so the button itself says it worked.
 */
@Component({
  selector: 'pb-copy-button',
  standalone: true,
  imports: [MatTooltipModule, PbIcon],
  template: `
    <button
      type="button"
      class="copy"
      [class.is-done]="done()"
      (click)="copy()"
      [attr.aria-label]="done() ? doneLabel() : label()"
      [matTooltip]="label()"
    >
      <pb-icon class="copy__icon copy__icon--copy" name="copy" [size]="16" />
      <pb-icon class="copy__icon copy__icon--check" name="check" [size]="16" [stroke]="2.4" />
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .copy {
      position: relative;
      display: inline-grid;
      place-items: center;
      inline-size: 34px;
      block-size: 34px;
      border: 1px solid var(--pb-neutral-200);
      border-radius: 10px;
      background: var(--pb-surface);
      color: var(--pb-neutral-600);
      cursor: pointer;
      transition:
        background-color 200ms var(--pb-ease-standard),
        border-color 200ms var(--pb-ease-standard),
        color 200ms var(--pb-ease-standard),
        scale 150ms var(--pb-ease-standard);

      &:hover {
        background: var(--pb-neutral-100);
        color: var(--pb-graphite);
      }

      &:active {
        scale: 0.9;
      }

      &:focus-visible {
        outline: 2px solid var(--pb-brand);
        outline-offset: 1px;
      }

      &.is-done {
        border-color: color-mix(in srgb, var(--pb-success) 35%, transparent);
        background: color-mix(in srgb, var(--pb-success) 10%, var(--pb-surface));
        color: var(--pb-success-ink);
      }
    }

    /* Both icons in one cell; the one not in use is turned away and shrunk. */
    .copy__icon {
      grid-area: 1 / 1;
      transition:
        opacity 180ms var(--pb-ease-standard),
        scale 320ms var(--pb-ease-spring),
        rotate 320ms var(--pb-ease-spring);
    }

    .copy__icon--check {
      opacity: 0;
      scale: 0.3;
      rotate: -45deg;
    }

    .is-done .copy__icon--copy {
      opacity: 0;
      scale: 0.3;
      rotate: 45deg;
    }

    .is-done .copy__icon--check {
      opacity: 1;
      scale: 1;
      rotate: 0deg;
    }

    @media (prefers-reduced-motion: reduce) {
      .copy__icon {
        transition-duration: 0ms;
      }
    }
  `,
})
export class PbCopyButton {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  /** Read out once it has copied. */
  readonly doneLabel = input('');
  readonly copied = output<void>();

  protected readonly done = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected copy(): void {
    void navigator.clipboard?.writeText(this.value()).then(
      () => {
        this.done.set(true);
        this.copied.emit();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.done.set(false), 2200);
      },
      () => undefined,
    );
  }
}
