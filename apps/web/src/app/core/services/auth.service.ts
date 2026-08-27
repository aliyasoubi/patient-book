import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { AuthTokens, AuthUser, UserRole } from '../models/common.model';
import { environment } from '../../../environments/environment';

const ACCESS_KEY = 'pb.access';
const REFRESH_KEY = 'pb.refresh';
const USER_KEY = 'pb.user';

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

  private readonly _user = signal<AuthUser | null>(this.readStoredUser());

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

  login(username: string, password: string): Observable<AuthTokens> {
    return this.http
      .post<AuthTokens>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(tap((tokens) => this.store(tokens)));
  }

  refresh(): Observable<AuthTokens> {
    const refreshToken = localStorage.getItem(REFRESH_KEY) ?? '';
    return this.http
      .post<AuthTokens>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(tap((tokens) => this.store(tokens)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/auth/change-password`, {
      currentPassword,
      newPassword,
    });
  }

  logout(redirect = true): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
    if (redirect) void this.router.navigate(['/login']);
  }

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  private store(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
    this._user.set(tokens.user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // Corrupt storage should log the user out, not crash the app shell.
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }
}
