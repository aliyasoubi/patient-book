import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';

import { AuthSession, AuthUser, UserRole } from '../models/common.model';
import { environment } from '../../../environments/environment';

/** Who may do what. Mirrors the guards on the API — the server still enforces. */
const PERMISSIONS = {
  editPatients: ['admin', 'dentist', 'receptionist'],
  archivePatients: ['admin', 'dentist'],
  manageUsers: ['admin'],
  viewHistory: ['admin', 'dentist'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.role ?? null);

  /**
   * Whether the current user may perform an action. This drives what the UI
   * offers; it is a convenience, not a security boundary — the API re-checks
   * every request.
   */
  can(permission: Permission): boolean {
    const role = this.role();
    return role !== null && (PERMISSIONS[permission] as readonly string[]).includes(role);
  }

  /** Restore a browser session from the Secure HttpOnly refresh cookie. */
  restoreSession(): Observable<void> {
    return this.refresh().pipe(
      map(() => undefined),
      catchError(() => {
        this.clearSession(false);
        return of(undefined);
      }),
    );
  }

  login(username: string, password: string): Observable<AuthSession> {
    return this.http
      .post<AuthSession>(
        `${environment.apiUrl}/auth/login`,
        { username, password },
        {
          withCredentials: true,
        },
      )
      .pipe(tap((session) => this.store(session)));
  }

  refresh(): Observable<AuthSession> {
    return this.http
      .post<AuthSession>(`${environment.apiUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(tap((session) => this.store(session)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(
      `${environment.apiUrl}/auth/change-password`,
      {
        currentPassword,
        newPassword,
      },
      { withCredentials: true },
    );
  }

  logout(redirect = true): void {
    this.http
      .post<void>(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(
        catchError(() => of(undefined)),
        finalize(() => this.clearSession(redirect)),
      )
      .subscribe();
  }

  get accessToken(): string | null {
    return this._accessToken();
  }

  /** Clear local authentication after a rejected refresh without another request. */
  expireSession(redirect = true): void {
    this.clearSession(redirect);
  }

  private store(session: AuthSession): void {
    this._accessToken.set(session.accessToken);
    this._user.set(session.user);
  }

  private clearSession(redirect: boolean): void {
    this._accessToken.set(null);
    this._user.set(null);
    if (redirect) void this.router.navigate(['/login']);
  }
}
