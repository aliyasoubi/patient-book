import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { ApiErrorTranslator } from '../i18n/api-error.translator';
import { ToastService } from '../../shared/ui/toast/toast.service';

/**
 * Statuses a component is expected to render itself — a form shows a validation
 * or conflict error inline against the offending field, where the user is
 * looking, rather than in a toast at the other end of the screen.
 */
const HANDLED_BY_CALLER = new Set([400, 401, 404, 409, 422]);

/**
 * Whether this interceptor left `error` for the caller to show. A caller that
 * has no field to pin it to — a switch on a list row — must then show it
 * itself, or the failure is silent.
 */
export function isHandledByCaller(error: unknown): boolean {
  return error instanceof HttpErrorResponse && HANDLED_BY_CALLER.has(error.status);
}

/**
 * Surfaces unexpected failures so a silent network error never looks like a
 * successful save. The wording comes from {@link ApiErrorTranslator}; the API
 * itself sends only codes.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const translator = inject(ApiErrorTranslator);

  return next(req).pipe(
    catchError((error: unknown) => {
      const shouldReport =
        !(error instanceof HttpErrorResponse) || !HANDLED_BY_CALLER.has(error.status);

      if (shouldReport) {
        toast.error(translator.translate(error));
      }
      return throwError(() => error);
    }),
  );
};
