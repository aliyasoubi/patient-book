import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { APP_VERSION_HEADER, AppVersion } from '../version/app-version';

/** Hands every reply's release to {@link AppVersion}, failures included. */
export const versionInterceptor: HttpInterceptorFn = (req, next) => {
  const version = inject(AppVersion);
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          version.noticeServer(event.headers.get(APP_VERSION_HEADER));
        }
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          version.noticeServer(error.headers?.get(APP_VERSION_HEADER) ?? null);
        }
      },
    }),
  );
};
