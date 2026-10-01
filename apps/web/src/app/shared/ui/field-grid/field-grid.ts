import { Component, ViewEncapsulation } from '@angular/core';

/**
 * The grid a form section lays its fields out on: as many ~230px columns as
 * fit, one on a phone. A field that needs the whole row — an address, notes,
 * a choice that shapes the rest of the form — takes the class
 * `pb-field-grid__full`.
 *
 * Unencapsulated on purpose: the full-row rule has to reach the projected
 * fields, which carry the page's style scope, not this one's. Every selector
 * starts at `pb-field-grid`, so nothing leaks beyond it.
 */
@Component({
  selector: 'pb-field-grid',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  styles: `
    pb-field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
      /* Row gap is small: each field reserves its own hint/error line. */
      gap: var(--pb-space-1) var(--pb-space-4);
    }

    pb-field-grid > .pb-field-grid__full {
      grid-column: 1 / -1;
    }
  `,
})
export class PbFieldGrid {}
