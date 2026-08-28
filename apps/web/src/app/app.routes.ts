import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Every feature is lazily loaded.
 *
 * Titles go through `$localize` so the browser tab reads in the user's language
 * along with the rest of the app. The patient list is the screen staff open
 * first, so it stays small: the form, detail view and registers each load on
 * demand instead of inflating the initial bundle.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
    title: $localize`:@@route.login:ورود — دفترچه بیماران`,
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
        title: $localize`:@@route.dashboard:داشبورد — دفترچه بیماران`,
      },
      {
        path: 'patients',
        loadComponent: () => import('./features/patients/patient-list').then((m) => m.PatientList),
        title: $localize`:@@route.patients:بیماران — دفترچه بیماران`,
      },
      {
        path: 'patients/new',
        loadComponent: () => import('./features/patients/patient-form').then((m) => m.PatientForm),
        title: $localize`:@@route.patientNew:بیمار جدید — دفترچه بیماران`,
      },
      {
        path: 'patients/:id',
        loadComponent: () =>
          import('./features/patients/patient-detail').then((m) => m.PatientDetail),
        title: $localize`:@@route.patientDetail:پرونده بیمار — دفترچه بیماران`,
      },
      {
        path: 'patients/:id/edit',
        loadComponent: () => import('./features/patients/patient-form').then((m) => m.PatientForm),
        title: $localize`:@@route.patientEdit:ویرایش پرونده — دفترچه بیماران`,
      },
      {
        path: 'implants',
        loadComponent: () => import('./features/implants/implant-list').then((m) => m.ImplantList),
        title: $localize`:@@route.implants:دفتر ایمپلنت — دفترچه بیماران`,
      },
      {
        path: 'ortho',
        loadComponent: () => import('./features/ortho/ortho-list').then((m) => m.OrthoList),
        title: $localize`:@@route.ortho:دفتر ارتودنسی — دفترچه بیماران`,
      },
      {
        path: 'surgery',
        loadComponent: () => import('./features/surgery/surgery-list').then((m) => m.SurgeryList),
        title: $localize`:@@route.surgery:لیست انتظار جراحی — دفترچه بیماران`,
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
        title: $localize`:@@route.settings:تنظیمات — دفترچه بیماران`,
      },
      {
        path: 'settings/account',
        loadComponent: () => import('./features/settings/account').then((m) => m.Account),
        title: $localize`:@@route.account:حساب کاربری — دفترچه بیماران`,
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
