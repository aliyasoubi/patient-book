import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import type { AuthSession } from '../models/common.model';
import { environment } from '../../../environments/environment';

/**
 * Shared across every in-flight request so that a burst of 401s triggers one
 * refresh, not one per request. `null` means "a refresh is running"; the token
 * value is published when it completes.
 */
let refreshRequest$: Observable<AuthSession> | null = null;

/** Endpoints that must never carry a token or trigger a refresh loop. */
const PUBLIC_AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const NON_REFRESHABLE_ENDPOINTS = PUBLIC_AUTH_ENDPOINTS;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isApiCall = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api');
  const isPublicAuthCall = PUBLIC_AUTH_ENDPOINTS.some((endpoint) => req.url.includes(endpoint));
  const isRefreshable = !NON_REFRESHABLE_ENDPOINTS.some((endpoint) => req.url.includes(endpoint));

  const token = auth.accessToken;
  const authorized =
    isApiCall && !isPublicAuthCall && token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !isRefreshable) {
        return throwError(() => error);
      }

      refreshRequest$ ??= auth.refresh().pipe(
        catchError((refreshError: unknown) => {
          auth.expireSession();
          return throwError(() => refreshError);
        }),
        finalize(() => {
          refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

      return refreshRequest$.pipe(
        switchMap((session) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${session.accessToken}` } })),
        ),
      );
    }),
  );
};
