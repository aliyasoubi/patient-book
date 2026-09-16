import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import { PbButton } from '../ui';

/**
 * The "could not load" banner every list shows in place of — never as — its
 * empty state. A blank register after a failed request would read as "no
 * records", which in a clinic is a different fact from "the server is down".
 * Callers keep whatever rows they already had on screen underneath it.
 */
@Component({
  selector: 'pb-load-error',
  standalone: true,
  imports: [MatIconModule, PbButton, TranslatePipe],
  template: `
    <div class="load-error" role="alert">
      <mat-icon class="load-error__icon" aria-hidden="true">cloud_off</mat-icon>
      <p class="load-error__text">{{ message() }}</p>
      <pb-button variant="stroked" type="button" icon="refresh" (click)="retry.emit()">
        {{ 'common.retry' | translate }}
      </pb-button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .load-error {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--pb-space-3);
      padding: var(--pb-space-3) var(--pb-space-4);
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
      border-radius: var(--mat-sys-corner-medium);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .load-error__icon {
      flex: 0 0 auto;
      color: var(--mat-sys-error);
    }
    .load-error__text {
      flex: 1 1 auto;
      margin: 0;
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class LoadError {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
