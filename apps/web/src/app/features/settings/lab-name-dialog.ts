import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { LabService } from '../../core/services/lab.service';
import type { Lab } from '../../core/models/common.model';
import { PbButton, PbTextField } from '../../shared/ui';

/** Add a lab, or rename one. Saves itself, so a taken name is shown on the field. */
@Component({
  selector: 'pb-lab-name-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbButton, PbTextField],
  template: `
    <h2 mat-dialog-title>
      {{ (data ? 'settings.renameLab' : 'settings.addLab') | translate }}
    </h2>
    <mat-dialog-content class="form">
      <pb-text-field [control]="name" [label]="'settings.labName' | translate" [maxlength]="80" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()" [disabled]="saving()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button
        variant="text"
        type="button"
        icon="save"
        (click)="submit()"
        [loading]="saving()"
        [loadingText]="'common.saving' | translate"
      >
        {{ 'settings.saveLab' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      min-width: min(360px, 80vw);
    }
  `,
})
export class LabNameDialog {
  protected readonly ref = inject<MatDialogRef<LabNameDialog, Lab | undefined>>(MatDialogRef);
  /** The lab being renamed; absent when adding one. */
  protected readonly data = inject<Lab | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly labs = inject(LabService);
  private readonly errors = inject(ApiErrorTranslator);

  protected readonly saving = signal(false);
  protected readonly name = new FormControl(this.data?.name ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });

  protected submit(): void {
    const name = this.name.value.trim();
    if (this.name.invalid || !name || this.saving()) {
      this.name.markAsTouched();
      return;
    }
    if (name === this.data?.name) {
      this.ref.close();
      return;
    }
    this.saving.set(true);
    const request = this.data
      ? this.labs.updateLab(this.data.id, { name })
      : this.labs.createLab(name);
    request.subscribe({
      next: (lab) => this.ref.close(lab),
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse) {
          this.name.setErrors({ server: this.errors.translate(error) });
          this.name.markAsTouched();
        }
      },
    });
  }
}
