import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { LabCase } from '../../core/models/common.model';
import type { LabReceiveParts } from '../../core/services/lab.service';
import { formatPersianCount } from '../../shared/pipes/persian-number.pipe';
import { PbButton, PbSelectField } from '../../shared/ui';
import { labWaitOptions } from './lab-options';

export interface LabReceiveDialogData {
  labCase: LabCase;
}

/** The lab's turnaround for parts that did not come with the work, unless someone picks another. */
const DEFAULT_PARTS_DAYS = '7';

/**
 * Asked when work that went with impression copings and analogs comes back:
 * the lab sends the parts apart from the work, so "received" alone says
 * nothing about them. Closes with how the work came — with its parts, or
 * without them and the days the lab has to send them; closing the dialog any
 * other way leaves the case where it is.
 */
@Component({
  selector: 'pb-lab-receive-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, TranslatePipe, PbButton, PbSelectField],
  template: `
    <h2 mat-dialog-title>{{ 'labReceive.title' | translate }}</h2>
    <mat-dialog-content class="body">
      <p class="body__who">
        {{
          'labSend.who'
            | translate: { name: data.labCase.recordedName, lab: data.labCase.lab?.name ?? '' }
        }}
      </p>
      <p>
        {{
          'labReceive.question'
            | translate
              : {
                  impressions: count(data.labCase.impressionCount),
                  analogs: count(data.labCase.analogCount),
                }
        }}
      </p>
      <!-- Only used if the parts did not come: how long the lab has to send them. -->
      <pb-select-field
        [control]="form.controls.waitDays"
        [options]="waitOptions()"
        [label]="'labReceive.waitDays' | translate"
        [hint]="'labReceive.waitDaysHint' | translate"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button variant="text" type="button" icon="hourglass_empty" (click)="workOnly()">
        {{ 'labReceive.workOnly' | translate }}
      </pb-button>
      <pb-button
        variant="text"
        type="button"
        icon="check"
        (click)="ref.close({ partsReturned: true })"
      >
        {{ 'labReceive.withParts' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      min-width: min(400px, 80vw);
    }
    .body__who {
      margin: 0 0 var(--pb-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LabReceiveDialog {
  protected readonly ref =
    inject<MatDialogRef<LabReceiveDialog, LabReceiveParts | undefined>>(MatDialogRef);
  protected readonly data = inject<LabReceiveDialogData>(MAT_DIALOG_DATA);
  private readonly i18n = inject(TranslateService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    waitDays: [DEFAULT_PARTS_DAYS],
  });

  protected readonly waitOptions = computed(() => {
    this.i18n.currentLang();
    return labWaitOptions(this.i18n);
  });

  protected count(value: number | null): string {
    return formatPersianCount(value ?? 0);
  }

  protected workOnly(): void {
    this.ref.close({
      partsReturned: false,
      partsWaitDays: Number(this.form.controls.waitDays.value),
    });
  }
}
