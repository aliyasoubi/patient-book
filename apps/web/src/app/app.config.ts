import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  LOCALE_ID,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { PersianDatepickerIntl, PersianPaginatorIntl } from './core/i18n/material-intl';
import { JALALI_DATE_FORMATS, JalaliDateAdapter } from './core/jalali/jalali-date-adapter';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),

    provideRouter(
      routes,
      withComponentInputBinding(),
      // Returning to the patient list should land where the user left it.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),

    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: './i18n/',
        suffix: '.json',
        failOnError: true,
        // Loads via HttpBackend, bypassing withInterceptors — otherwise the
        // error interceptor injects ApiErrorTranslator -> TranslateService
        // while TranslateService is still constructing itself (NG0200).
        useHttpBackend: true,
      }),
      fallbackLang: 'fa',
      lang: 'fa',
    }),
    provideAppInitializer(() => firstValueFrom(inject(TranslateService).use('fa'))),
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSession())),

    // Angular's locale-aware pipes and the JSON dictionary use Persian by default.
    { provide: LOCALE_ID, useValue: 'fa' },
    { provide: MAT_DATE_LOCALE, useValue: 'fa-IR' },

    // Every date in this app is Jalali; the adapter makes the Material
    // datepicker count months the Jalali way rather than the Gregorian way.
    { provide: DateAdapter, useClass: JalaliDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: JALALI_DATE_FORMATS },
    { provide: MatDatepickerIntl, useClass: PersianDatepickerIntl },
    { provide: MatPaginatorIntl, useClass: PersianPaginatorIntl },

    // Material Symbols is a ligature font, so <mat-icon> needs its class as the
    // default font set for `<mat-icon>search</mat-icon>` to render.
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: { fontSet: 'material-symbols-rounded' },
    },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: { duration: 4000, horizontalPosition: 'center', verticalPosition: 'bottom' },
    },
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useValue: { showDelay: 400, hideDelay: 0, touchendHideDelay: 1200 },
    },
  ],
};
