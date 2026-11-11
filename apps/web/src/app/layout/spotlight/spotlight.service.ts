import { Injectable, signal } from '@angular/core';

/**
 * Opens and closes the spotlight search. Anything can ask — the sidebar's
 * search button, the toolbar's field, Ctrl+Space — and the shell draws it once.
 */
@Injectable({ providedIn: 'root' })
export class SpotlightService {
  private readonly _open = signal(false);
  readonly isOpen = this._open.asReadonly();

  open(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update((open) => !open);
  }
}
