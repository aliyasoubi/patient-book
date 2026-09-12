import { DestroyRef, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';

/** A routed form that can be holding typed-but-unsaved input. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Ask before leaving a form with unsaved edits.
 *
 * A mis-tap on the bottom nav halfway through a patient record used to throw
 * the whole thing away silently. The form decides what "unsaved" means (a
 * dirty reactive form, a changed treatment set); this only asks. Wire it with
 * `canDeactivate: [unsavedChangesGuard]` on the route, and pair it with
 * {@link warnBeforeUnload} for the tab-close case the router never sees.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) return true;

  const i18n = inject(TranslateService);
  const data: ConfirmData = {
    title: i18n.instant('unsaved.title'),
    message: i18n.instant('unsaved.message'),
    confirmLabel: i18n.instant('unsaved.leave'),
    cancelLabel: i18n.instant('unsaved.stay'),
    tone: 'warn',
  };
  return inject(MatDialog)
    .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
    .afterClosed()
    .pipe(map((confirmed) => confirmed === true));
};

/**
 * Browser-level counterpart of the guard: reload, tab close and typing a new
 * address bypass the router entirely, so they get the native "leave site?"
 * prompt instead. Call from a component constructor; the listener is removed
 * with the component.
 */
export function warnBeforeUnload(hasUnsavedChanges: () => boolean): void {
  const handler = (event: BeforeUnloadEvent): void => {
    if (!hasUnsavedChanges()) return;
    // Browsers show their own fixed wording; setting `returnValue` is what
    // still triggers the prompt in Chrome.
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', handler));
}
