import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addDays } from 'date-fns-jalali';

import type { LabCase, LabTripKind } from '../../core/models/common.model';
import type { LabSendInput } from '../../core/services/lab.service';
import { labWaitOptions, labTripKindOptions } from './lab-options';
import { defaultLabWaitDays } from '../../shared/labels';
import { PbButton, PbDateField, PbSelectField, PbTextField } from '../../shared/ui';

export interface LabSendDialogData {
  labCase: LabCase;
}

/**
 * What a case goes back to the lab for, the second time and after. The first
 * time back is usually the next step of the work — resin for laminates, the
 * frame for a crown; after that it is a correction more often than not.
 */
export function suggestedTripKind(c: Pick<LabCase, 'workTypes' | 'trips'>): LabTripKind {
  if (c.trips.length > 1) return 'correction';
  return c.workTypes.includes('laminate') ? 'resin' : 'frame';
}

@Component({
  selector: 'pb-lab-send-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    TranslatePipe,
    PbButton,
    PbDateField,
    PbSelectField,
    PbTextField,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'labSend.title' | translate }}</h2>
    <mat-dialog-content class="form">
      <p class="form__who">
        {{
          'labSend.who'
            | translate: { name: data.labCase.recordedName, lab: data.labCase.lab?.name ?? '' }
        }}
      </p>
      <pb-select-field
        [control]="form.controls.kind"
        [options]="kindOptions"
        [label]="'labForm.tripKind' | translate"
      />
      <pb-date-field [control]="form.controls.sentAt" [label]="'labForm.sentAt' | translate" />
      <pb-select-field
        [control]="form.controls.waitDays"
        [options]="waitOptions()"
        [label]="'labForm.waitDays' | translate"
        [hint]="expectedHint()"
      />
      <pb-text-field
        [control]="form.controls.note"
        [label]="'labForm.tripNote' | translate"
        [hint]="'labForm.tripNoteHint' | translate"
        [maxlength]="300"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button variant="text" type="button" icon="send" (click)="submit()">
        {{ 'labSend.confirm' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      min-width: min(400px, 80vw);
    }
    .form__who {
      margin: 0 0 var(--pb-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LabSendDialog {
  protected readonly ref =
    inject<MatDialogRef<LabSendDialog, LabSendInput | undefined>>(MatDialogRef);
  protected readonly data = inject<LabSendDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly i18n = inject(TranslateService);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);

  protected readonly kindOptions = labTripKindOptions();

  protected readonly form = this.fb.nonNullable.group({
    kind: [suggestedTripKind(this.data.labCase) as string, Validators.required],
    sentAt: [new Date() as Date | null, Validators.required],
    waitDays: [String(defaultLabWaitDays(this.data.labCase.workTypes)), Validators.required],
    note: ['', Validators.maxLength(300)],
  });

  protected readonly waitOptions = computed(() => {
    this.i18n.currentLang();
    return labWaitOptions(this.i18n);
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  /** The day it is due back, so nobody has to count. */
  protected readonly expectedHint = computed(() => {
    this.i18n.currentLang();
    const { sentAt, waitDays } = this.value();
    if (!sentAt || !waitDays) return null;
    return this.i18n.instant('labForm.expectedOn', {
      date: this.dateAdapter.format(addDays(sentAt, Number(waitDays)), 'yyyy/MM/dd'),
    });
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.ref.close({
      kind: raw.kind as LabTripKind,
      sentAt: this.dateAdapter.toIso8601(raw.sentAt!),
      waitDays: Number(raw.waitDays),
      note: raw.note.trim() || null,
    });
  }
}
