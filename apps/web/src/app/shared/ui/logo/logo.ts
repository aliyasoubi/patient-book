import { Component, computed, input } from '@angular/core';

/**
 * The Dentixo symbol mark.
 *
 * Inlined as SVG rather than loaded from `public/brand/dentixo-mark.svg`:
 * an `<img>` can't inherit `currentColor`, and the mark has to follow the
 * palette the user picks in settings (cyan/green/violet) and invert on the
 * login screen's coloured panel. The paths here are the same geometry the
 * files in `public/brand/` carry — that directory stays the source of truth
 * for anything outside the app (favicon, app icons, documents).
 *
 * Under 24px the detailed mark thins into mush, so `size` picks the heavier
 * small-size drawing automatically; nothing at a call site has to know.
 */
@Component({
  selector: 'pb-logo',
  standalone: true,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    <svg
      viewBox="0 0 48 48"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="small() ? 5.5 : 4"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.role]="label() ? 'img' : 'presentation'"
      [attr.aria-label]="label()"
      [attr.aria-hidden]="label() ? null : 'true'"
    >
      <path [attr.d]="toothPath()" />
      <path [attr.d]="sparkPath()" fill="currentColor" [attr.stroke-width]="small() ? 3 : 2" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      color: var(--mat-sys-primary);
    }
    svg {
      display: block;
    }
  `,
})
export class PbLogo {
  /** Rendered size in px, both axes. Under 24 switches to the heavier drawing. */
  readonly size = input(32);
  /**
   * Accessible name. Left empty the mark is decorative — which is right
   * wherever the wordmark sits next to it as real text.
   */
  readonly label = input('');

  protected readonly small = computed(() => this.size() < 24);

  protected readonly toothPath = computed(() =>
    this.small()
      ? 'M18 12C11 12 6 15.2 6 20.2c0 3.6.7 6.4 1.7 9.6C8.7 33 9.4 37.5 11.6 37.5c2 0 3-4.8 3.8-7.1.5-1.5 1.3-2.1 2.6-2.1s2.1.6 2.6 2.1c.8 2.3 1.8 7.1 3.8 7.1 2.2 0 2.9-4.5 3.9-7.7 1-3.2 1.7-6 1.7-9.6C30 15.2 25 12 18 12Z'
      : 'M18 11C10.4 11 5 14.6 5 19.8c0 3.8.6 6.8 1.6 10.2C7.6 33.4 8.4 38 10.8 38c2.2 0 3.2-5 4-7.4.6-1.6 1.6-2.2 3.2-2.2s2.6.6 3.2 2.2c.8 2.4 1.8 7.4 4 7.4 2.4 0 3.2-4.6 4.2-8 1-3.4 1.6-6.4 1.6-10.2C31 14.6 25.6 11 18 11Z',
  );

  protected readonly sparkPath = computed(() =>
    this.small()
      ? 'M39 8.6c.7 3.9 1.6 4.8 5.5 5.4-3.9.7-4.8 1.6-5.5 5.4-.7-3.9-1.6-4.8-5.5-5.4 3.9-.7 4.8-1.6 5.5-5.4Z'
      : 'M39 9.2c.5 3.4 1.4 4.1 4.6 4.6-3.2.5-4.1 1.2-4.6 4.6-.5-3.4-1.4-4.1-4.6-4.6 3.2-.5 4.1-1.2 4.6-4.6Z',
  );
}
