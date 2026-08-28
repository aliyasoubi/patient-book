import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../i18n/api-error.translator';

/**
 * Statuses a component is expected to render itself — a form shows a validation
 * or conflict error inline against the offending field, where the user is
 * looking, rather than in a snackbar at the other end of the screen.
 */
const HANDLED_BY_CALLER = new Set([400, 401, 404, 409, 422]);

/**
 * Surfaces unexpected failures so a silent network error never looks like a
 * successful save. The wording comes from {@link ApiErrorTranslator}; the API
 * itself sends only codes.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const translator = inject(ApiErrorTranslator);
  const i18n = inject(TranslateService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const shouldReport =
        !(error instanceof HttpErrorResponse) || !HANDLED_BY_CALLER.has(error.status);

      if (shouldReport) {
        snackBar.open(translator.translate(error), i18n.instant('action.dismiss'), {
          duration: 6000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: 'pb-snackbar-error',
        });
      }
      return throwError(() => error);
    }),
  );
};
