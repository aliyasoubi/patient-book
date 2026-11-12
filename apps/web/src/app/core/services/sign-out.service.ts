import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';

import { ConfirmDialog, type ConfirmData } from '../../shared/components/confirm-dialog';
import { AuthService } from './auth.service';

/**
 * Signing out, asked first: one stray tap on «خروج» would otherwise end the
 * session and drop whatever was half-typed. Every sign-out button — the
 * sidebar's user menu, the phone's «more» sheet, the password gate — goes
 * through here, so they all ask the same way.
 */
@Injectable({ providedIn: 'root' })
export class SignOutService {
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(TranslateService);

  ask(): void {
    const data: ConfirmData = {
      title: this.i18n.instant('signOut.title'),
      message: this.i18n.instant('signOut.message'),
      confirmLabel: this.i18n.instant('app.logout'),
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '400px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.auth.logout();
      });
  }
}
