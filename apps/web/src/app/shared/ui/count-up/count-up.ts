import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';

import { formatPersianCount } from '../../pipes/persian-number.pipe';

/**
 * A count that arrives rather than appears: it eases from where it was (zero,
 * the first time) to the new value over `duration`, fast at first and
 * settling at the end, grouped and in Persian digits throughout. Reduced
 * motion shows the number at once.
 */
@Component({
  selector: 'pb-count-up',
  standalone: true,
  template: `{{ text() }}`,
  host: { '[attr.aria-label]': 'label()' },
  styles: `
    :host {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class PbCountUp {
  readonly value = input.required<number>();
  readonly duration = input(900);
  readonly delay = input(0);

  protected readonly text = signal(formatPersianCount(0));
  protected readonly label = signal('');

  constructor() {
    let shown = 0;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const still =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    effect(() => {
      const target = this.value();
      const duration = this.duration();
      const delay = this.delay();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      // Screen readers get the real number at once, not every step of the count.
      this.label.set(formatPersianCount(target));
      if (still || target === shown) {
        shown = target;
        this.text.set(formatPersianCount(target));
        return;
      }
      const from = shown;
      timer = setTimeout(() => {
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 4); // ease-out quart
          shown = Math.round(from + (target - from) * eased);
          this.text.set(formatPersianCount(shown));
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      }, delay);
    });

    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    });
  }
}
