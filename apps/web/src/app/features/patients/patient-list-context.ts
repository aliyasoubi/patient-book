import { Injectable, signal } from '@angular/core';

/** Scroll offsets the register was left at, for the URL it was showing. */
interface ListPosition {
  url: string;
  /** `main.page`, which the card layout scrolls. */
  page: number;
  /** The table wrapper, which the desktop layout scrolls instead. */
  table: number;
}

/**
 * Where the register was left, so a patient page can hand staff back to it:
 * the same search, filters, page and sort — and the same scroll offset —
 * rather than page one of an unfiltered list.
 *
 * Positions are remembered for one URL only. Coming back to the list at any
 * other URL is a different list, and starts at the top.
 */
@Injectable({ providedIn: 'root' })
export class PatientListContext {
  /** The list's URL, query string included, as of the last time it was shown. */
  readonly url = signal<string | null>(null);

  private position: ListPosition | null = null;

  leave(position: ListPosition): void {
    this.position = position;
  }

  positionFor(url: string): ListPosition | null {
    return this.position?.url === url ? this.position : null;
  }
}
