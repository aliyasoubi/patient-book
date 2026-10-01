import { Component, input } from '@angular/core';

export type PageWidth = 'wide' | 'content' | 'form' | 'narrow';

/**
 * The column every routed screen sits in: a centred, width-capped stack with
 * the app's page padding and the gap between its sections. Each screen used
 * to set these itself, and they had drifted — 16px or 20px at the top, 12px,
 * 14px or 16px on a phone, 14px or 16px between sections.
 *
 * Only the host is styled and the content is projected as-is, so a page's own
 * stylesheet still reaches its sections as direct children (`.list > *`) and
 * can add to the host through a class, e.g. the patient list fitting itself
 * to the screen height.
 *
 * Widths: `wide` for registers and the dashboard, `content` for record and
 * list pages, `form` for edit forms and settings, `narrow` for single-column
 * account forms.
 */
@Component({
  selector: 'pb-page',
  standalone: true,
  host: {
    '[attr.data-width]': 'width()',
  },
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--pb-page-gap);
      max-width: var(--pb-page-content);
      margin-inline: auto;
      padding: var(--pb-page-block-start) var(--pb-page-inline) var(--pb-page-block-end);

      @media (max-width: 700px) {
        padding: var(--pb-page-block-start-compact) var(--pb-page-inline-compact)
          var(--pb-page-block-end-compact);
      }
    }

    :host([data-width='wide']) {
      max-width: var(--pb-page-wide);
    }

    :host([data-width='form']) {
      max-width: var(--pb-page-form);
    }

    :host([data-width='narrow']) {
      max-width: var(--pb-page-narrow);
    }
  `,
})
export class PbPage {
  readonly width = input<PageWidth>('content');
}
