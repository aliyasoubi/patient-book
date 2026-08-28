import { Component, input } from '@angular/core';

export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

/** Compact semantic status label with theme-safe M3 container colours. */
@Component({
  selector: 'pb-status-chip',
  standalone: true,
  template: `<ng-content />`,
  host: {
    class: 'pb-status-chip',
    '[attr.data-tone]': 'tone()',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding-inline: var(--pb-space-2);
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
      letter-spacing: var(--mat-sys-label-small-tracking);
      line-height: 1;
      white-space: nowrap;
    }

    :host([data-tone='primary']) {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    :host([data-tone='success']) {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    :host([data-tone='warning']) {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    :host([data-tone='error']) {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class PbStatusChip {
  readonly tone = input<StatusTone>('neutral');
}
