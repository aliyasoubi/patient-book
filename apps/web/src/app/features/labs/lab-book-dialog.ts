import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import type { LabCase } from '../../core/models/common.model';
import { PbButton, PbDateField } from '../../shared/ui';

export interface LabBookDialogData {
  labCase: LabCase;
}

/**
 * The day the patient is booked for the fitting. Only the day: the hour is in
 * the appointment book, and what the board needs is when to expect them. On a
 * booked case it opens on the day it has, to change it. Closes with the
 * Jalali day, or nothing.
 */
@Component({
  selector: 'pb-lab-book-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbButton, PbDateField],
  template: `
    <h2 mat-dialog-title>
      {{ (data.labCase.appointmentAt ? 'labBook.changeTitle' : 'labBook.title') | translate }}
    </h2>
    <mat-dialog-content class="form">
      <p class="form__who">
        {{
          'labSend.who'
            | translate: { name: data.labCase.recordedName, lab: data.labCase.lab?.name ?? '' }
        }}
      </p>
      <pb-date-field [control]="form.controls.date" [label]="'labBook.date' | translate" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button variant="text" type="button" icon="event_available" (click)="submit()">
        {{ 'labBook.confirm' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      min-width: min(360px, 80vw);
    }
    .form__who {
      margin: 0 0 var(--pb-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LabBookDialog {
  protected readonly ref = inject<MatDialogRef<LabBookDialog, string | undefined>>(MatDialogRef);
  protected readonly data = inject<LabBookDialogData>(MAT_DIALOG_DATA);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);

  protected readonly form = inject(FormBuilder).group({
    date: [
      this.data.labCase.appointmentAt
        ? this.dateAdapter.parse(this.data.labCase.appointmentAt, 'yyyy/MM/dd')
        : (null as Date | null),
      Validators.required,
    ],
  });

  protected submit(): void {
    const date = this.form.controls.date.value;
    if (this.form.invalid || !date) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(this.dateAdapter.toIso8601(date));
  }
}
