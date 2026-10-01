import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PbBanner, PbButton } from '../ui';

/**
 * The "could not load" banner every list shows in place of — never as — its
 * empty state. A blank register after a failed request would read as "no
 * records", which in a clinic is a different fact from "the server is down".
 * Callers keep whatever rows they already had on screen underneath it.
 */
@Component({
  selector: 'pb-load-error',
  standalone: true,
  imports: [PbBanner, PbButton, TranslatePipe],
  template: `
    <pb-banner tone="error" icon="cloud_off" role="alert">
      {{ message() }}
      <pb-button pbBannerAction variant="stroked" icon="refresh" (click)="retry.emit()">
        {{ 'common.retry' | translate }}
      </pb-button>
    </pb-banner>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class LoadError {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
