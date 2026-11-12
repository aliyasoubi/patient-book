import { Component, input, linkedSignal, output } from '@angular/core';

let nextId = 0;

/**
 * A yes/no that waits for the form's Save — "sold to patients" on a stock
 * item, a filter toggle. A real checkbox under the drawing, so the keyboard,
 * screen readers and a click on its words all behave as they should.
 *
 * Drawn in the brand: a rounded box that fills with the accent, its tick
 * drawing itself in stroke by stroke, the box giving a small spring as it
 * fills. The whole line is the target, and lightly highlights on hover.
 */
@Component({
  selector: 'pb-checkbox-field',
  standalone: true,
  host: { '[class.is-on]': 'on()' },
  template: `
    <label class="check" [for]="id">
      <input
        class="check__native"
        type="checkbox"
        [id]="id"
        [checked]="on()"
        (change)="toggle($event)"
      />
      <span class="check__box" aria-hidden="true">
        <svg viewBox="0 0 16 16"><path class="check__tick" d="M3.5 8.4l3 3 6-6.4" /></svg>
      </span>
      <span class="check__label"><ng-content /></span>
    </label>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .check {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--pb-space-3);
      padding: var(--pb-space-2) var(--pb-space-3) var(--pb-space-2) var(--pb-space-2);
      border-radius: 12px;
      color: var(--pb-graphite, var(--mat-sys-on-surface));
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: background-color 160ms var(--pb-ease-standard);

      &:hover {
        background: var(--pb-neutral-100, var(--mat-sys-surface-container));
      }
    }

    /* Out of sight but still the thing that is focused and toggled. */
    .check__native {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }

    .check__box {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      inline-size: 22px;
      block-size: 22px;
      border: 1.5px solid var(--pb-neutral-300, var(--mat-sys-outline));
      border-radius: 7px;
      background: var(--pb-surface);
      transition:
        background-color 220ms var(--pb-ease-standard),
        border-color 220ms var(--pb-ease-standard),
        box-shadow 220ms var(--pb-ease-standard),
        scale 360ms var(--pb-ease-spring);

      .check:hover & {
        border-color: var(--pb-neutral-400, var(--mat-sys-outline));
      }

      .check:active & {
        scale: 0.88;
      }

      :host(.is-on) & {
        border-color: var(--pb-brand, var(--mat-sys-primary));
        background: var(--pb-brand, var(--mat-sys-primary));
        box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--pb-brand, #ff6a00) 55%, transparent);
      }

      .check__native:focus-visible + & {
        outline: 2px solid var(--pb-brand, var(--mat-sys-primary));
        outline-offset: 2px;
      }

      svg {
        inline-size: 16px;
        block-size: 16px;
        overflow: visible;
      }
    }

    /* The tick draws itself in when checked, and wipes out when not. */
    .check__tick {
      fill: none;
      stroke: #fff;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 16;
      stroke-dashoffset: 16;
      transition: stroke-dashoffset 260ms var(--pb-ease-standard);

      :host(.is-on) & {
        stroke-dashoffset: 0;
        transition: stroke-dashoffset 320ms 80ms var(--pb-ease-emphasized);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .check__box,
      .check__tick {
        transition-duration: 0ms;
      }
    }
  `,
})
export class PbCheckboxField {
  readonly checked = input(false);
  readonly checkedChange = output<boolean>();

  protected readonly id = `pb-check-${nextId++}`;
  /** What the box shows: the click at once, then `checked` again when it changes. */
  protected readonly on = linkedSignal(() => this.checked());

  protected toggle(event: Event): void {
    const next = (event.target as HTMLInputElement).checked;
    this.on.set(next);
    this.checkedChange.emit(next);
  }
}
