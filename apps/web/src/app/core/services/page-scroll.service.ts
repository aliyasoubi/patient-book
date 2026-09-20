import { Injectable } from '@angular/core';

/**
 * The element that scrolls the page — `main.page` in the shell, not the
 * window. The router's own scroll restoration only knows the window, and the
 * window never moves here; a page that wants to come back to where it was
 * reads and sets its offset through this instead.
 *
 * The offset is kept by a passive listener rather than read on demand: by
 * the time a component is destroyed its DOM has already been detached, and a
 * detached element reports a scroll offset of zero.
 */
@Injectable({ providedIn: 'root' })
export class PageScroll {
  private element: HTMLElement | null = null;

  /** Current offset of the page, as of its last scroll event. */
  top = 0;

  private readonly onScroll = (): void => {
    this.top = this.element?.scrollTop ?? 0;
  };

  /** Called by the shell once, with the element that owns the page's overflow. */
  attach(element: HTMLElement | null): void {
    this.element?.removeEventListener('scroll', this.onScroll);
    this.element = element;
    this.top = element?.scrollTop ?? 0;
    element?.addEventListener('scroll', this.onScroll, { passive: true });
  }

  scrollTo(top: number): void {
    if (!this.element) return;
    this.element.scrollTop = top;
    this.top = this.element.scrollTop;
  }
}
