import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService, Permission } from '../services/auth.service';
import type { UserRole } from '../models/common.model';

/** Require a signed-in user; bounce to login remembering where they wanted to go. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    if (auth.user()?.mustChangePassword && state.url !== '/settings/account') {
      return router.createUrlTree(['/settings/account']);
    }
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Require one of the given roles. */
export const roleGuard =
  (...roles: UserRole[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (role && roles.includes(role)) return true;
    return router.createUrlTree(['/']);
  };

/**
 * Require a permission from the same table that decides which buttons show.
 * The API still refuses the request either way; this keeps a viewer who types
 * `/patients/new` into the address bar off a form every save would reject.
 */
export const permissionGuard =
  (permission: Permission): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.can(permission) ? true : router.createUrlTree(['/']);
  };

/** Keep a signed-in user away from the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
