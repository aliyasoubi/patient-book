import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PbIcon } from '../ui/icon/icon';
import { isLineIcon, type LineIconName } from '../ui/icon/line-icons';

/**
 * The Material names callers already pass, drawn as line icons. Anything
 * not here still renders, as the Material glyph.
 */
const LINE_FOR: Readonly<Record<string, LineIconName>> = {
  inbox: 'inbox',
  event_busy: 'calendar',
  inventory: 'packages',
  person_search: 'file-search',
  science: 'flask',
  shopping_cart: 'packages',
  search_off: 'file-search',
  groups: 'users',
};

/**
 * "Nothing here", said the same way on every list: the icon on a lifted
 * tile at the middle of two faint rings, a dot riding one of them, then a
 * title, a line of help and whatever action the caller projects.
 *
 * It arrives the way the sign-in page does — rings open out, the tile pops
 * on a spring, the words rise — and then the tile floats, slowly, so an
 * empty screen still feels looked after rather than broken.
 */
@Component({
  selector: 'pb-empty-state',
  standalone: true,
  imports: [MatIconModule, PbIcon],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly hint = input<string>('');

  protected readonly lineIcon = computed<LineIconName | null>(() => {
    const name = this.icon();
    return isLineIcon(name) ? name : (LINE_FOR[name] ?? null);
  });
}
