import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { authGuard, guestGuard, permissionGuard } from './core/guards/auth.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

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
      // Write screens carry the same permission that shows their entry
      // button, so a viewer cannot reach a form by typing its URL. The API is
      // still the boundary; this only spares them a screen that cannot save.
      {
        path: 'patients/new',
        canActivate: [permissionGuard('editPatients')],
        canDeactivate: [unsavedChangesGuard],
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
        canActivate: [permissionGuard('editPatients')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/patients/patient-form').then((m) => m.PatientForm),
        title: translatedTitle('route.patientEdit'),
      },
      // One screen for both registers; `kind` reaches the component as a
      // route-data input.
      {
        path: 'implants',
        data: { kind: 'implant' },
        loadComponent: () =>
          import('./features/registries/registry-list').then((m) => m.RegistryList),
        title: translatedTitle('route.implants'),
      },
      {
        path: 'ortho',
        data: { kind: 'ortho' },
        loadComponent: () =>
          import('./features/registries/registry-list').then((m) => m.RegistryList),
        title: translatedTitle('route.ortho'),
      },
      {
        path: 'surgery',
        loadComponent: () => import('./features/surgery/surgery-list').then((m) => m.SurgeryList),
        title: translatedTitle('route.surgery'),
      },
      {
        path: 'surgery/new',
        canActivate: [permissionGuard('editSurgery')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/surgery/surgery-form').then((m) => m.SurgeryForm),
        title: translatedTitle('route.surgeryNew'),
      },
      {
        path: 'surgery/:id/edit',
        canActivate: [permissionGuard('editSurgery')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/surgery/surgery-form').then((m) => m.SurgeryForm),
        title: translatedTitle('route.surgeryEdit'),
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
    ],
  },
  { path: '**', redirectTo: '' },
];
