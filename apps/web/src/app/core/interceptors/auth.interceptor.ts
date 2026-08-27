import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Shared across every in-flight request so that a burst of 401s triggers one
 * refresh, not one per request. `null` means "a refresh is running"; the token
 * value is published when it completes.
 */
let refreshInFlight = false;
const refreshedToken = new BehaviorSubject<string | null>(null);

/** Endpoints that must never carry a token or trigger a refresh loop. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isApiCall = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api');
  const isAuthCall = AUTH_ENDPOINTS.some((e) => req.url.includes(e));

  const token = auth.accessToken;
  const authorized =
    isApiCall && !isAuthCall && token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthCall) {
        return throwError(() => error);
      }
      if (!auth.refreshToken) {
        auth.logout();
        return throwError(() => error);
      }

      if (refreshInFlight) {
        // Queue behind the refresh already running, then retry.
        return refreshedToken.pipe(
          filter((t): t is string => t !== null),
          take(1),
          switchMap((fresh) =>
            next(req.clone({ setHeaders: { Authorization: `Bearer ${fresh}` } })),
          ),
        );
      }

      refreshInFlight = true;
      refreshedToken.next(null);

      return auth.refresh().pipe(
        switchMap((tokens) => {
          refreshInFlight = false;
          refreshedToken.next(tokens.accessToken);
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }));
        }),
        catchError((refreshError: unknown) => {
          refreshInFlight = false;
          auth.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
