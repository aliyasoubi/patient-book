import { Component, computed, input } from '@angular/core';

import { LINE_ICONS, type LineIconName } from './line-icons';

/**
 * A line icon: thin, even strokes with round ends, drawn inline so it takes
 * `currentColor` and can be animated stroke by stroke. Sized by `size` in
 * px, or by the parent's `font-size` when `size` is left at `1em`.
 *
 * Decorative by default (`aria-hidden`); give it a `label` when the icon is
 * the only thing saying what something is.
 */
@Component({
  selector: 'pb-icon',
  standalone: true,
  host: {
    '[style.--pb-icon-size]': 'sizeValue()',
  },
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
})
export class PbIcon {
  readonly name = input.required<LineIconName>();
  /** px, or `1em` to follow the surrounding text. */
  readonly size = input<number | '1em'>(20);
  readonly stroke = input(1.75);
  readonly label = input('');

  protected readonly paths = computed(() => LINE_ICONS[this.name()]);
  protected readonly sizeValue = computed(() => {
    const size = this.size();
    return typeof size === 'number' ? `${size}px` : size;
  });
}
