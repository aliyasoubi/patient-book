import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';

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
  imports: [MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">
        {{ data.cancelLabel ?? ('action.cancel' | translate) }}
      </button>
      <button
        mat-button
        type="button"
        [class.confirm--danger]="data.tone === 'warn'"
        (click)="ref.close(true)"
        cdkFocusInitial
      >
        {{ data.confirmLabel ?? ('action.confirm' | translate) }}
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
     * M3 basic dialogs use text buttons for every action — a filled button is
     * the full-screen dialog's idiom. Archiving is still destructive from the
     * user's point of view, so that one action takes the error role. Done by
     * overriding the text button's own tokens rather than \`color\`, which M3
     * ignores: this recolours the hover/focus/pressed state layers along with
     * the label instead of repainting the text and leaving the overlays keyed
     * to the primary hue.
     */
    .confirm--danger {
      --mat-button-text-label-text-color: var(--mat-sys-error);
      --mat-button-text-state-layer-color: var(--mat-sys-error);
      --mat-button-text-ripple-color: color-mix(in srgb, var(--mat-sys-error) 12%, transparent);
    }
  `,
})
export class ConfirmDialog {
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
