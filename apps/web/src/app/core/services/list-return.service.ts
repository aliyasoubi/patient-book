import { Injectable, effect, inject, untracked } from '@angular/core';

import { AuthService } from './auth.service';

/**
 * Where a list was left — its URL with the search, filters and page in the
 * query string — so a form opened from it can hand staff back to the same
 * list after Save or Cancel, not page one of everything. The patient
 * register does the same through its own `PatientListContext`, which also
 * keeps a scroll offset.
 *
 * Only URLs this app wrote are kept, one per list, and only for one under
 * that list's own path; anything else falls back to the bare list. A search
 * can be a patient's name, so the URLs are held in memory only and dropped
 * when the session ends or someone else signs in.
 */
@Injectable({ providedIn: 'root' })
export class ListReturn {
  private readonly auth = inject(AuthService);
  private readonly urls = new Map<string, string>();
  private userId: string | null = null;

  constructor() {
    // By id, not by object: a token refresh hands back the same person.
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => {
        if (userId !== this.userId) this.urls.clear();
        this.userId = userId;
      });
    });
  }

  /** The list at `path` (e.g. `/surgery`) is now showing `url`. */
  remember(path: string, url: string): void {
    if (url === path || url.startsWith(`${path}?`)) this.urls.set(path, url);
  }

  /** The URL to go back to for the list at `path`. */
  urlFor(path: string): string {
    return this.urls.get(path) ?? path;
  }
}
