import { Component, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { LabService } from '../../core/services/lab.service';
import type { Lab } from '../../core/models/common.model';
import { PbButton, PbIconButton, PbSwitch } from '../../shared/ui';
import { LabNameDialog } from './lab-name-dialog';

/**
 * The labs the case form offers: add one, rename one, switch one off. A lab
 * no longer used is switched off, not deleted: its old cases still name it.
 */
@Component({
  selector: 'pb-lab-list-dialog',
  standalone: true,
  imports: [MatDialogModule, TranslatePipe, PbButton, PbIconButton, PbSwitch],
  template: `
    <h2 mat-dialog-title>{{ 'labs.manage' | translate }}</h2>
    <mat-dialog-content>
      <p class="hint">{{ 'labs.manageHint' | translate }}</p>
      <ul class="labs">
        @for (lab of labs(); track lab.id) {
          <li class="labs__item" [class.labs__item--inactive]="!lab.isActive">
            <span class="labs__name">{{ lab.name }}</span>
            <pb-switch
              [checked]="lab.isActive"
              [disabled]="busy() === lab.id"
              (checkedChange)="setActive(lab, $event)"
            >
              {{ 'labs.labActive' | translate }}
            </pb-switch>
            <pb-icon-button
              icon="edit"
              size="compact"
              (click)="openName(lab)"
              [ariaLabel]="'labs.renameLab' | translate"
            />
          </li>
        }
      </ul>
      <pb-button variant="text" icon="add" (click)="openName(null)">
        {{ 'labs.addLab' | translate }}
      </pb-button>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" mat-dialog-close>
        {{ 'action.dismiss' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styleUrl: './lab-list-dialog.scss',
})
export class LabListDialog {
  private readonly labService = inject(LabService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(TranslateService);

  protected readonly labs = signal<Lab[]>([]);
  /** The lab whose switch is mid-flight. */
  protected readonly busy = signal<string | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.labService
      .labs()
      .subscribe({ next: (labs) => this.labs.set(labs), error: () => undefined });
  }

  /** Add a lab (`null`), or rename one. */
  protected openName(lab: Lab | null): void {
    this.dialog
      .open(LabNameDialog, { data: lab, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.snackBar.open(this.i18n.instant('labs.labSaved'), this.i18n.instant('action.dismiss'));
        this.load();
      });
  }

  /** Off: no longer offered for new cases. Its old cases keep naming it. */
  protected setActive(lab: Lab, isActive: boolean): void {
    this.busy.set(lab.id);
    this.labService.updateLab(lab.id, { isActive }).subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
      },
      error: () => {
        this.busy.set(null);
        this.load();
      },
    });
  }
}
