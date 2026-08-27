import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PatientsService } from '../../core/services/patients.service';
import { AuthService } from '../../core/services/auth.service';
import { JalaliPipe } from '../../shared/pipes/jalali.pipe';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import {
  caseStatusLabel,
  educationLabel,
  genderIcon,
  genderLabel,
  treatmentColor,
} from '../../shared/labels';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { PbButton, PbSurface } from '../../shared/ui';
import type { DataIssue, Patient } from '../../core/models/patient.model';
import type { AuditEntry } from '../../core/models/common.model';

@Component({
  selector: 'pb-patient-detail',
  standalone: true,
  imports: [
    RouterLink, MatButtonModule, MatMenuModule, MatTabsModule,
    MatProgressBarModule, MatTooltipModule, MatDialogModule,
    JalaliPipe, PersianNumberPipe, PbButton, PbSurface,
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

  protected readonly initials = computed(() => {
    const p = this.patient();
    if (!p) return '';
    return [p.firstName?.[0], p.lastName?.[0]].filter(Boolean).join('');
  });

  /** Grouped for the "details" tab, skipping anything the record does not hold. */
  protected readonly detailRows = computed(() => {
    const p = this.patient();
    if (!p) return [];
    const rows: Array<{ icon: string; label: string; value: string; ltr?: boolean }> = [];
    const push = (icon: string, label: string, value: string | null | undefined, ltr = false) => {
      if (value) rows.push({ icon, label, value, ltr });
    };

    push('badge', $localize`:@@field.nationalId:کد ملی`, p.nationalId, true);
    push('escalator_warning', $localize`:@@field.fatherName:نام پدر`, p.fatherName);
    push('work', $localize`:@@field.occupation:شغل`, p.occupation);
    push(
      'school',
      $localize`:@@field.education:تحصیلات`,
      p.education !== 'unknown' ? educationLabel(p.education) : p.educationRaw,
    );
    push('smartphone', $localize`:@@field.mobile:موبایل`, p.mobile, true);
    push('call', $localize`:@@field.homePhone:تلفن منزل`, p.homePhone, true);
    push('home', $localize`:@@field.homeAddress:آدرس منزل`, p.homeAddress);
    push('apartment', $localize`:@@field.workAddress:آدرس محل کار`, p.workAddress);
    push('share', $localize`:@@field.referralSource:نحوه آشنایی`, p.referralSource?.name ?? null);
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

  protected readonly unnamed = $localize`:@@patient.unnamed:بدون نام`;

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
        $localize`:@@patient.issueResolved:هشدار بررسی و برداشته شد.`,
        $localize`:@@action.dismiss:بستن`,
      );
    });
  }

  protected archive(): void {
    const p = this.patient();
    if (!p) return;
    const data: ConfirmData = {
      title: $localize`:@@archive.title:بایگانی پرونده`,
      message: $localize`:@@archive.message:پرونده «${p.fullName}:name:» به بایگانی منتقل می‌شود. اطلاعات حذف نمی‌شود و هر زمان قابل بازگردانی است.`,
      confirmLabel: $localize`:@@archive.confirm:بایگانی کن`,
      tone: 'warn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.service.archive(p.id).subscribe(() => {
          this.snackBar.open(
            $localize`:@@archive.done:پرونده بایگانی شد.`,
            $localize`:@@action.dismiss:بستن`,
          );
          void this.router.navigate(['/patients']);
        });
      });
  }

  protected restore(): void {
    this.service.restore(this.id()).subscribe((patient) => {
      this.patient.set(patient);
      this.snackBar.open(
        $localize`:@@archive.restored:پرونده از بایگانی خارج شد.`,
        $localize`:@@action.dismiss:بستن`,
      );
    });
  }

  /** Field name in an audit entry. Falls back to the raw key when unmapped. */
  protected changeLabel(key: string): string {
    switch (key) {
      case 'fileNo': return $localize`:@@field.fileNo:شماره پرونده`;
      case 'firstName': return $localize`:@@field.firstName:نام`;
      case 'lastName': return $localize`:@@field.lastName:نام خانوادگی`;
      case 'nationalId': return $localize`:@@field.nationalId:کد ملی`;
      case 'mobile': return $localize`:@@field.mobile:موبایل`;
      case 'homePhone': return $localize`:@@field.homePhone:تلفن منزل`;
      case 'gender': return $localize`:@@field.gender:جنسیت`;
      case 'birthDate': return $localize`:@@field.birthDate:تاریخ تولد`;
      case 'occupation': return $localize`:@@field.occupation:شغل`;
      case 'education': return $localize`:@@field.education:تحصیلات`;
      case 'medicalHistory': return $localize`:@@field.medicalHistory:سابقه بیماری`;
      case 'homeAddress': return $localize`:@@field.homeAddress:آدرس منزل`;
      case 'lastVisitAt': return $localize`:@@field.lastVisit:آخرین مراجعه`;
      case 'fullName': return $localize`:@@field.fullName:نام کامل`;
      case 'resolvedIssue': return $localize`:@@field.resolvedIssue:رفع هشدار`;
      default: return key;
    }
  }

  protected actionLabel(action: string): string {
    switch (action) {
      case 'create': return $localize`:@@auditAction.create:ایجاد`;
      case 'update': return $localize`:@@auditAction.update:ویرایش`;
      case 'delete': return $localize`:@@auditAction.delete:بایگانی`;
      case 'restore': return $localize`:@@auditAction.restore:بازگردانی`;
      default: return action;
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

  protected formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }
}
