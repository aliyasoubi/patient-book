import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

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
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">
        {{ data.cancelLabel ?? defaultCancel }}
      </button>
      <button
        mat-flat-button
        type="button"
        [class.confirm--danger]="data.tone === 'warn'"
        (click)="ref.close(true)"
        cdkFocusInitial>
        {{ data.confirmLabel ?? defaultConfirm }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      margin: 0;
      line-height: 1.9;
      color: var(--mat-sys-on-surface-variant);
    }

    /*
     * Archiving a record is irreversible from the user's point of view, so the
     * confirm button has to read as destructive.
     *
     * M3 dropped the \`color\` input — it is documented as having no effect under
     * an M3 theme, and this dialog previously relied on \`[color]="warn"\`, so the
     * button rendered as an ordinary primary one. The M3 way is to override the
     * filled button's own tokens with the error role, which recolours the hover,
     * focus and pressed state layers along with the container rather than
     * repainting the background and leaving the overlays keyed to the wrong hue.
     */
    .confirm--danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
      --mat-button-filled-state-layer-color: var(--mat-sys-on-error);
      --mat-button-filled-ripple-color:
          color-mix(in srgb, var(--mat-sys-on-error) 12%, transparent);
    }
  `,
})
export class ConfirmDialog {
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);

  protected readonly defaultCancel = $localize`:@@action.cancel:انصراف`;
  protected readonly defaultConfirm = $localize`:@@action.confirm:تأیید`;
}
