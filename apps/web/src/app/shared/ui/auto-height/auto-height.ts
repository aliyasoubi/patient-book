import { Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * A box whose height follows its content smoothly instead of jumping: when
 * what is inside grows or shrinks — a mode switched, a message shown, a month
 * with one more week — the box eases to the new height. Its content is laid
 * out as a column, spaced by `--auto-gap` (none by default). While it moves
 * it clips what does not fit yet; at rest nothing is clipped, so popovers and
 * focus rings inside are drawn as usual. Reduced motion jumps straight there.
 */
@Component({
  selector: 'pb-auto-height',
  standalone: true,
  template: `<div class="inner"><ng-content /></div>`,
  host: { '(transitionend)': 'settle($event)' },
  styles: `
    :host {
      display: block;
      min-inline-size: 0;
      transition: height 320ms var(--pb-ease-standard);
    }

    :host(.is-moving) {
      overflow: clip;
      overflow-clip-margin: 8px;
    }

    .inner {
      display: flex;
      flex-direction: column;
      gap: var(--auto-gap, 0);
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition: none;
      }
    }
  `,
})
export class PbAutoHeight {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const inner = this.host.firstElementChild as HTMLElement;
      let last = -1;
      const observer = new ResizeObserver(() => {
        const height = inner.getBoundingClientRect().height;
        if (height === last) return;
        if (last >= 0) this.host.classList.add('is-moving');
        this.host.style.height = `${height}px`;
        last = height;
      });
      observer.observe(inner);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected settle(event: TransitionEvent): void {
    if (event.target === this.host && event.propertyName === 'height') {
      this.host.classList.remove('is-moving');
    }
  }
}
