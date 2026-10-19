import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

import type { SurgeryQueueItem } from '../../core/models/common.model';
import { PbButton, PbDateField } from '../../shared/ui';

export interface SurgeryBookDialogData {
  item: SurgeryQueueItem;
}

/** What the dialog closes with: the Jalali day, or `null` for a booking with no day written down. */
export interface SurgeryBookResult {
  date: string | null;
}

/**
 * The patient has been given an appointment for the follow-up. The day is
 * optional — the hour is in the appointment book, and the front desk does not
 * always have the day to hand — so confirming with it empty is a booking all
 * the same. On a booked row it opens on the day it has, to change it.
 * Dismissing closes with nothing, and the row stays as it was.
 */
@Component({
  selector: 'pb-surgery-book-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbButton, PbDateField],
  template: `
    <h2 mat-dialog-title>
      {{
        (data.item.followUpAppointmentAt ? 'surgeryBook.changeTitle' : 'surgeryBook.title')
          | translate
      }}
    </h2>
    <mat-dialog-content class="form">
      <p class="form__who">{{ data.item.recordedName }}</p>
      <pb-date-field
        [control]="form.controls.date"
        [label]="'surgeryBook.date' | translate"
        [hint]="'surgeryBook.hint' | translate"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button variant="text" type="button" icon="event_available" (click)="submit()">
        {{ 'surgeryBook.confirm' | translate }}
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
export class SurgeryBookDialog {
  protected readonly ref =
    inject<MatDialogRef<SurgeryBookDialog, SurgeryBookResult | undefined>>(MatDialogRef);
  protected readonly data = inject<SurgeryBookDialogData>(MAT_DIALOG_DATA);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);

  protected readonly form = inject(FormBuilder).group({
    date: [
      this.data.item.followUpAppointmentAt
        ? this.dateAdapter.parse(this.data.item.followUpAppointmentAt, 'yyyy/MM/dd')
        : (null as Date | null),
    ],
  });

  protected submit(): void {
    // Left empty is a booking with no day; typed but not a date is a mistake
    // to correct, not that — and on a booked row it would wipe the day it had.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const date = this.form.controls.date.value;
    this.ref.close({ date: date ? this.dateAdapter.toIso8601(date) : null });
  }
}
