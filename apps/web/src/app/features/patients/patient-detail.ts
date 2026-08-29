import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PatientsService } from './data/patients.service';
import { AuthService } from '../../core/services/auth.service';
import { JalaliPipe } from '../../shared/pipes/jalali.pipe';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import {
  RegistryCaseDialog,
  RegistryCaseDialogData,
} from '../../shared/components/registry-case-dialog';
import {
  caseStatusLabel,
  educationLabel,
  fieldLabel,
  genderIcon,
  genderLabel,
  treatmentColor,
} from '../../shared/labels';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { PbAvatar, PbButton, PbSurface } from '../../shared/ui';
import type { DataIssue, Patient } from './data/patient.model';
import type { AuditEntry } from '../../core/models/common.model';

@Component({
  selector: 'pb-patient-detail',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatMenuModule,
    MatTabsModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatDialogModule,
    JalaliPipe,
    PersianNumberPipe,
    PbButton,
    PbSurface,
    PbAvatar,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './patient-detail.html',
  styleUrl: './patient-detail.scss',
})
export class PatientDetail {
  private readonly service = inject(PatientsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly genderLabel = genderLabel;
  protected readonly genderIcon = genderIcon;
  protected readonly educationLabel = educationLabel;
  protected readonly caseStatusLabel = caseStatusLabel;
  protected readonly color = treatmentColor;

  protected readonly loading = signal(true);
  protected readonly patient = signal<Patient | null>(null);
  protected readonly history = signal<AuditEntry[]>([]);
  protected readonly historyLoaded = signal(false);

  /** Grouped for the "details" tab, skipping anything the record does not hold. */
  protected readonly detailRows = computed(() => {
    this.i18n.currentLang();
    const p = this.patient();
    if (!p) return [];
    const rows: Array<{ icon: string; label: string; value: string; ltr?: boolean }> = [];
    const push = (icon: string, label: string, value: string | null | undefined, ltr = false) => {
      if (value) rows.push({ icon, label, value, ltr });
    };

    push('badge', this.i18n.instant('field.nationalId'), p.nationalId, true);
    push('escalator_warning', this.i18n.instant('field.fatherName'), p.fatherName);
    push('work', this.i18n.instant('field.occupation'), p.occupation);
    push(
      'school',
      this.i18n.instant('field.education'),
      p.education !== 'unknown' ? this.i18n.instant(educationLabel(p.education)) : p.educationRaw,
    );
    push('smartphone', this.i18n.instant('field.mobile'), p.mobile, true);
    push('call', this.i18n.instant('field.homePhone'), p.homePhone, true);
    push('home', this.i18n.instant('field.homeAddress'), p.homeAddress);
    push('apartment', this.i18n.instant('field.workAddress'), p.workAddress);
    push('share', this.i18n.instant('field.referralSource'), p.referralSource?.name ?? null);
    return rows;
  });

  constructor() {
    // Route inputs are bound after construction, so the id can only be read
    // inside an effect. This also re-fetches when navigating straight from one
    // patient to another, where the component instance is reused.
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.historyLoaded.set(false);
    this.history.set([]);
    this.service.get(id).subscribe({
      next: (patient) => {
        this.patient.set(patient);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigate(['/patients']);
      },
    });
  }

  /** Renders an import flag in the reader's language, from its code. */
  protected issueMessage(issue: DataIssue): string {
    return this.errors.forCode(issue.code, issue.params);
  }

  protected loadHistory(): void {
    if (this.historyLoaded() || !this.auth.can('viewHistory')) return;
    this.historyLoaded.set(true);
    this.service.history(this.id()).subscribe((entries) => this.history.set(entries));
  }

  /** Dismiss an import warning once staff have checked the underlying value. */
  protected resolveIssue(field: string): void {
    this.service.resolveIssue(this.id(), field).subscribe((patient) => {
      this.patient.set(patient);
      this.snackBar.open(
        this.i18n.instant('patient.issueResolved'),
        this.i18n.instant('action.dismiss'),
      );
    });
  }

  protected archive(): void {
    const p = this.patient();
    if (!p) return;
    const data: ConfirmData = {
      title: this.i18n.instant('archive.title'),
      message: this.i18n.instant('archive.message', { name: p.fullName }),
      confirmLabel: this.i18n.instant('archive.confirm'),
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.service.archive(p.id).subscribe(() => {
          this.snackBar.open(
            this.i18n.instant('archive.done'),
            this.i18n.instant('action.dismiss'),
          );
          void this.router.navigate(['/patients']);
        });
      });
  }

  protected restore(): void {
    this.service.restore(this.id()).subscribe((patient) => {
      this.patient.set(patient);
      this.snackBar.open(
        this.i18n.instant('archive.restored'),
        this.i18n.instant('action.dismiss'),
      );
    });
  }

  /** Opens a new ortho or implant پرونده already linked to this patient. */
  protected addCase(kind: RegistryCaseDialogData['kind']): void {
    const p = this.patient();
    if (!p) return;
    const data: RegistryCaseDialogData = {
      kind,
      patientId: p.id,
      patientName: p.fullName,
      patientMobile: p.mobile,
      patientHomePhone: p.homePhone,
    };
    this.dialog
      .open(RegistryCaseDialog, { data, width: '480px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.snackBar.open(
          this.i18n.instant(
            kind === 'ortho' ? 'patientDetail.orthoCaseCreated' : 'patientDetail.implantCaseCreated',
          ),
          this.i18n.instant('action.dismiss'),
        );
        this.load(p.id);
      });
  }

  /** Field name in an audit entry. Falls back to the raw key when unmapped. */
  protected changeLabel(key: string): string {
    return this.i18n.instant(fieldLabel(key));
  }

  protected actionLabel(action: string): string {
    switch (action) {
      case 'create':
        return this.i18n.instant('auditAction.create');
      case 'update':
        return this.i18n.instant('auditAction.update');
      case 'delete':
        return this.i18n.instant('auditAction.delete');
      case 'restore':
        return this.i18n.instant('auditAction.restore');
      default:
        return this.i18n.instant('auditAction.other');
    }
  }

  protected changeEntries(changes: AuditEntry['changes']): Array<[string, unknown]> {
    return changes ? Object.entries(changes) : [];
  }

  protected asChange(value: unknown): { from?: unknown; to?: unknown } | null {
    return value && typeof value === 'object' && ('from' in value || 'to' in value)
      ? (value as { from?: unknown; to?: unknown })
      : null;
  }

  protected formatValue(value: unknown, field: string): string {
    if (value === null || value === undefined || value === '') return '—';

    if (field === 'gender' && typeof value === 'string') {
      return this.i18n.instant(genderLabel(value));
    }
    if (field === 'education' && typeof value === 'string') {
      return this.i18n.instant(educationLabel(value));
    }
    if (field === 'resolvedIssue' && typeof value === 'string') return this.changeLabel(value);
    if (field === 'isArchived' && typeof value === 'boolean') {
      return value
        ? this.i18n.instant('archive.statusArchived')
        : this.i18n.instant('archive.statusActive');
    }
    if (field === 'referralSource' && typeof value === 'object') {
      const name = (value as { name?: unknown }).name;
      return typeof name === 'string' ? name : this.i18n.instant('value.notRecorded');
    }
    if (field === 'treatments' && Array.isArray(value)) {
      const count = formatPersianCount(value.length);
      return this.i18n.instant('audit.treatmentCount', { count });
    }
    if (field === 'dataIssues' && Array.isArray(value)) {
      const count = formatPersianCount(value.length);
      return this.i18n.instant('audit.issueCount', { count });
    }
    if (typeof value === 'boolean') {
      return value ? this.i18n.instant('value.yes') : this.i18n.instant('value.no');
    }
    if (Array.isArray(value)) {
      const count = formatPersianCount(value.length);
      return this.i18n.instant('value.itemCount', { count });
    }
    if (typeof value === 'object') return this.i18n.instant('value.recordedDetails');
    return String(value);
  }
}
