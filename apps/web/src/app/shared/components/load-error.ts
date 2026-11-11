import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PbButton } from '../ui/button/button';
import { PbIcon } from '../ui/icon/icon';

/**
 * The "could not load" state every list shows in place of — never as — its
 * empty state. A blank register after a failed request would read as "no
 * records", which in a clinic is a different fact from "the server is down".
 * Callers keep whatever rows they already had on screen underneath it.
 *
 * A card, not a red slab: the signal icon on a soft red tile shakes once as
 * it arrives, the message says what failed, and the one action retries. It
 * slides open on its own height, so the list beneath moves down smoothly.
 */
@Component({
  selector: 'pb-load-error',
  standalone: true,
  imports: [PbButton, PbIcon, TranslatePipe],
  templateUrl: './load-error.html',
  styleUrl: './load-error.scss',
})
export class LoadError {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
