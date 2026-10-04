import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { AuthService } from '../../../core/services/auth.service';

/** A patient as the recent list shows one: enough to label a link, nothing clinical. */
export interface RecentPatient {
  id: string;
  fileNo: string;
  fullName: string;
}

const KEY_PREFIX = 'pb.recentPatients.';
const MAX_RECENT = 5;

/**
 * The last few patient files this user opened, offered by the empty search
 * box — the front desk reopens the same handful of files all day.
 *
 * In `sessionStorage`, per user, and dropped on sign-out: patient names are
 * part of the record, and on a shared front-desk computer they must not
 * outlive the browser session or greet the next person to sign in. Storage
 * that is blocked or full only costs the list its survival across a reload.
 */
@Injectable({ providedIn: 'root' })
export class RecentPatientsService {
  private readonly auth = inject(AuthService);
  private readonly _items = signal<RecentPatient[]>([]);
  readonly items = this._items.asReadonly();

  constructor() {
    let previous: string | null = null;
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => {
        // A session ending — sign-out, expiry, someone else signing in —
        // takes the last user's list with it. A reload's restore only reads.
        if (previous && previous !== userId) this.forget(previous);
        previous = userId;
        this._items.set(userId ? this.read(userId) : []);
      });
    });
  }

  /** Puts a just-opened file at the top, once. */
  record(patient: RecentPatient): void {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const { id, fileNo, fullName } = patient;
    const items = [{ id, fileNo, fullName }, ...this._items().filter((p) => p.id !== id)].slice(
      0,
      MAX_RECENT,
    );
    this._items.set(items);
    try {
      sessionStorage.setItem(KEY_PREFIX + userId, JSON.stringify(items));
    } catch {
      // Kept in memory for this page; see the class note.
    }
  }

  private read(userId: string): RecentPatient[] {
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY_PREFIX + userId) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isRecentPatient).slice(0, MAX_RECENT) : [];
    } catch {
      return [];
    }
  }

  private forget(userId: string): void {
    try {
      sessionStorage.removeItem(KEY_PREFIX + userId);
    } catch {
      // Nothing was stored, then.
    }
  }
}

function isRecentPatient(value: unknown): value is RecentPatient {
  const v = value as Partial<RecentPatient> | null;
  return (
    typeof v?.id === 'string' && typeof v.fileNo === 'string' && typeof v.fullName === 'string'
  );
}
