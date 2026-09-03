import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';

/**
 * Every feature is lazily loaded.
 *
 * Titles resolve from the active JSON dictionary so the browser tab follows the user's language
 * along with the rest of the app. The patient list is the screen staff open
 * first, so it stays small: the form, detail view and registers each load on
 * demand instead of inflating the initial bundle.
 */
const translatedTitle =
  (key: string): ResolveFn<string> =>
  () =>
    inject(TranslateService).instant(key);

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
    title: translatedTitle('route.login'),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
        title: translatedTitle('route.dashboard'),
      },
      {
        path: 'patients',
        loadComponent: () => import('./features/patients/patient-list').then((m) => m.PatientList),
        title: translatedTitle('route.patients'),
      },
      {
        path: 'patients/new',
        loadComponent: () => import('./features/patients/patient-form').then((m) => m.PatientForm),
        title: translatedTitle('route.patientNew'),
      },
      {
        path: 'patients/:id',
        loadComponent: () =>
          import('./features/patients/patient-detail').then((m) => m.PatientDetail),
        title: translatedTitle('route.patientDetail'),
      },
      {
        path: 'patients/:id/edit',
        loadComponent: () => import('./features/patients/patient-form').then((m) => m.PatientForm),
        title: translatedTitle('route.patientEdit'),
      },
      {
        path: 'implants',
        loadComponent: () => import('./features/implants/implant-list').then((m) => m.ImplantList),
        title: translatedTitle('route.implants'),
      },
      {
        path: 'ortho',
        loadComponent: () => import('./features/ortho/ortho-list').then((m) => m.OrthoList),
        title: translatedTitle('route.ortho'),
      },
      {
        path: 'surgery',
        loadComponent: () => import('./features/surgery/surgery-list').then((m) => m.SurgeryList),
        title: translatedTitle('route.surgery'),
      },
      {
        path: 'surgery/new',
        loadComponent: () => import('./features/surgery/surgery-form').then((m) => m.SurgeryForm),
        title: translatedTitle('route.surgeryNew'),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
        title: translatedTitle('route.settings'),
      },
      {
        path: 'settings/account',
        loadComponent: () => import('./features/settings/account').then((m) => m.Account),
        title: translatedTitle('route.account'),
      },
      {
        // Admin-only, matching the API's own guard on `/data-exchange`. The
        // server is still the boundary; this keeps a non-admin from landing on
        // a screen whose every request would be rejected.
        path: 'settings/data-exchange',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/settings/data-exchange').then((m) => m.DataExchange),
        title: translatedTitle('route.dataExchange'),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
