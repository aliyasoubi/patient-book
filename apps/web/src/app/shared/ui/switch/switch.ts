import { Component, booleanAttribute, input, linkedSignal, output } from '@angular/core';

/**
 * An on/off switch for something that takes effect the moment it is flipped:
 * a lab in use, "follow-up done" on a surgery row. A setting that waits for a
 * Save button is a `pb-checkbox-field` instead.
 *
 * Drawn in the brand: a fog track that fills with the accent, and a white
 * knob that springs across. It answers the tap at once — the knob moves
 * before the server does — and follows `checked` again when the parent's
 * data comes back, so a refused change slides back on its own.
 */
@Component({
  selector: 'pb-switch',
  standalone: true,
  host: {
    '[class.is-on]': 'on()',
    '[class.is-disabled]': 'disabled()',
  },
  template: `
    <button
      class="pb-switch"
      type="button"
      role="switch"
      [attr.aria-checked]="on()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span class="pb-switch__label"><ng-content /></span>
      <span class="pb-switch__track" aria-hidden="true">
        <span class="pb-switch__knob"></span>
      </span>
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .pb-switch {
      display: inline-flex;
      align-items: center;
      gap: var(--pb-space-2);
      padding: var(--pb-space-1);
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--pb-neutral-600, var(--mat-sys-on-surface-variant));
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: color 200ms var(--pb-ease-standard);

      &:focus-visible {
        outline: 2px solid var(--pb-brand, var(--mat-sys-primary));
        outline-offset: 2px;
      }

      &:disabled {
        cursor: progress;
      }
    }

    :host(.is-on) .pb-switch {
      color: var(--pb-graphite, var(--mat-sys-on-surface));
    }

    .pb-switch__label:empty {
      display: none;
    }

    .pb-switch__track {
      position: relative;
      flex: 0 0 auto;
      inline-size: 40px;
      block-size: 24px;
      border-radius: 999px;
      background: var(--pb-neutral-300, var(--mat-sys-outline-variant));
      transition: background-color 240ms var(--pb-ease-standard);
    }

    :host(.is-on) .pb-switch__track {
      background: var(--pb-brand, var(--mat-sys-primary));
    }

    /* The knob starts at the reading start (the right) and springs to the end when on. */
    .pb-switch__knob {
      position: absolute;
      inset-block-start: 3px;
      inset-inline-start: 3px;
      inline-size: 18px;
      block-size: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow:
        0 1px 2px rgb(31 31 35 / 0.18),
        0 2px 6px rgb(31 31 35 / 0.08);
      translate: 0 0;
      transition:
        translate 380ms var(--pb-ease-spring),
        inline-size 200ms var(--pb-ease-standard);
    }

    :host(.is-on) .pb-switch__knob {
      translate: -16px 0;
    }

    /* Pressed, the knob stretches a little toward where it is going. */
    .pb-switch:active:not(:disabled) .pb-switch__knob {
      inline-size: 22px;
    }

    :host(.is-on) .pb-switch:active:not(:disabled) .pb-switch__knob {
      translate: -12px 0;
    }

    :host(.is-disabled) .pb-switch__track {
      opacity: 0.6;
    }

    @media (prefers-reduced-motion: reduce) {
      .pb-switch__knob,
      .pb-switch__track {
        transition-duration: 0ms;
      }
    }
  `,
})
export class PbSwitch {
  readonly checked = input(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly checkedChange = output<boolean>();

  /** What the switch shows: the tap at once, then `checked` again when it changes. */
  protected readonly on = linkedSignal(() => this.checked());

  protected toggle(): void {
    const next = !this.on();
    this.on.set(next);
    this.checkedChange.emit(next);
  }
}
