import { Injectable, signal } from '@angular/core';

/** The header the API names its release in, on every signed-in reply. */
export const APP_VERSION_HEADER = 'X-App-Version';

/** The release a page was built as: stamped into index.html at image build. */
export function stampedVersion(doc: Document = document): string {
  return doc.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || 'dev';
}

/**
 * Which release this tab is running, and whether another one now serves.
 *
 * A tab opened before a deploy keeps the code it loaded — its screens and
 * the shape of what it sends — until it is reloaded, and at the front desk
 * that can be all day. Once a reply names a different release, the top bar
 * offers the reload. It never forces one: a form may be half filled.
 */
@Injectable({ providedIn: 'root' })
export class AppVersion {
  readonly running = stampedVersion();

  private readonly changed = signal(false);
  /** Another release answered: this tab is out of date. */
  readonly updateReady = this.changed.asReadonly();

  /** Each reply's header. A reply without one (signed out) says nothing. */
  noticeServer(version: string | null): void {
    if (version && version !== this.running) this.changed.set(true);
  }

  reload(): void {
    location.reload();
  }
}
