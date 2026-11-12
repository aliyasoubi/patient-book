import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

// Not from the `../ui` barrel: the unsaved-changes guard opens this dialog and
// is imported eagerly by the routes, so a barrel import here pulled every
// field component (datepicker, autocomplete, …) into the initial bundle —
// about 90 kB over budget.
import { PbButton } from '../ui/button/button';

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
    <!-- One clear primary: the action the dialog asks about, filled — red
         when it loses or removes something. Beside it the way out, quiet in
         graphite. Focus starts on the way out for a destructive one, so Enter
         on a dialog that just opened never archives or discards. -->
    <mat-dialog-actions align="end">
      <pb-button
        variant="text"
        tone="neutral"
        (click)="ref.close(false)"
        [attr.cdkFocusInitial]="data.tone === 'warn' ? '' : null"
      >
        {{ data.cancelLabel ?? ('action.cancel' | translate) }}
      </pb-button>
      <pb-button
        variant="flat"
        [tone]="data.tone === 'warn' ? 'danger' : 'default'"
        (click)="ref.close(true)"
        [attr.cdkFocusInitial]="data.tone === 'warn' ? null : ''"
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
