import { Component, ViewEncapsulation } from '@angular/core';

/**
 * The controls above a list, laid out the same on every list page:
 *
 * 1. a row of 56dp controls — the search bar, and beside it whatever the page
 *    needs: a dropdown (`pb-select-field subscript="dynamic"`) or a button —
 *    every one the same height, on one top and bottom edge;
 * 2. a row of 32dp filter chips (`pb-filter-chips`) under it.
 *
 * A 56dp bar and 32dp chips never share a line. On a phone a dropdown moves
 * under the search, full width, and the chips stay one line that scrolls
 * sideways, as in Gmail and Drive, rather than wrapping into a block.
 *
 * Unencapsulated on purpose, like `pb-field-grid`: the rules have to reach the
 * projected controls, which carry the page's style scope. Every selector
 * starts at `pb-list-toolbar`, so nothing leaks beyond it.
 */
@Component({
  selector: 'pb-list-toolbar',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pb-list-toolbar__bar"><ng-content /></div>
    <div class="pb-list-toolbar__chips"><ng-content select="pb-filter-chips" /></div>
  `,
  styles: `
    pb-list-toolbar {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-3);
      min-width: 0;
    }

    pb-list-toolbar > .pb-list-toolbar__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--pb-space-3);
    }

    pb-list-toolbar > .pb-list-toolbar__bar > pb-search-field {
      flex: 1 1 280px;
      min-width: 0;
    }

    pb-list-toolbar > .pb-list-toolbar__bar > pb-select-field {
      flex: 0 1 240px;
      min-width: 180px;
    }

    /* A button on the bar is as tall as the bar. */
    pb-list-toolbar > .pb-list-toolbar__bar > pb-button {
      flex: 0 0 auto;
      --mat-button-outlined-container-height: var(--pb-search-height);
      --mat-button-filled-container-height: var(--pb-search-height);
      --mat-button-text-container-height: var(--pb-search-height);
    }

    pb-list-toolbar > .pb-list-toolbar__chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0 var(--pb-space-2);
      min-width: 0;
    }

    pb-list-toolbar > .pb-list-toolbar__chips:empty {
      display: none;
    }

    @media (max-width: 599.98px) {
      /* The search keeps an icon-only button beside it; a dropdown takes
         the next line, full width. */
      pb-list-toolbar > .pb-list-toolbar__bar > pb-search-field {
        flex-basis: 200px;
      }

      pb-list-toolbar > .pb-list-toolbar__bar > pb-select-field {
        flex-basis: 100%;
      }

      /* One line that scrolls sideways; the bar's edge clips it, so a chip
         cut at the edge says there is more. */
      pb-list-toolbar > .pb-list-toolbar__chips {
        flex-wrap: nowrap;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
      }

      pb-list-toolbar > .pb-list-toolbar__chips::-webkit-scrollbar {
        display: none;
      }

      pb-list-toolbar > .pb-list-toolbar__chips > pb-filter-chips {
        flex: none;
      }

      pb-list-toolbar > .pb-list-toolbar__chips .mdc-evolution-chip-set__chips {
        flex-wrap: nowrap;
      }
    }
  `,
})
export class PbListToolbar {}
