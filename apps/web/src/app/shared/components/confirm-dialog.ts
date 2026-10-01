import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { PbButton } from '../ui';

export interface ConfirmData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'warn';
}

/** Shared confirmation prompt for anything that changes a record irreversibly. */
@Component({
  selector: 'pb-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, PbButton, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
    </mat-dialog-content>
    <!-- M3 basic dialogs use text buttons for every action — a filled button
         is the full-screen dialog's idiom. Archiving is still destructive from
         the user's point of view, so that one action takes the danger tone. -->
    <mat-dialog-actions align="end">
      <pb-button variant="text" (click)="ref.close(false)">
        {{ data.cancelLabel ?? ('action.cancel' | translate) }}
      </pb-button>
      <pb-button
        variant="text"
        [tone]="data.tone === 'warn' ? 'danger' : 'default'"
        (click)="ref.close(true)"
        cdkFocusInitial
      >
        {{ data.confirmLabel ?? ('action.confirm' | translate) }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      margin: 0;
      line-height: 1.9;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ConfirmDialog {
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
