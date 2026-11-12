import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';

import { formatPersianCount } from '../../pipes/persian-number.pipe';

/**
 * A count that eases from where it was (zero by default the first time)
 * to the new value over `duration`, fast at first and
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
  readonly animateInitial = input(true);

  protected readonly text = signal(formatPersianCount(0));
  protected readonly label = signal('');

  constructor() {
    let shown: number | null = null;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const motion =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

    effect(() => {
      const target = this.value();
      const duration = this.duration();
      const delay = this.delay();
      const animateInitial = this.animateInitial();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      // Screen readers get the real number at once, not every step of the count.
      this.label.set(formatPersianCount(target));
      const from = shown ?? 0;
      if (motion?.matches || (shown === null && !animateInitial) || target === from) {
        shown = target;
        this.text.set(formatPersianCount(target));
        return;
      }
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
