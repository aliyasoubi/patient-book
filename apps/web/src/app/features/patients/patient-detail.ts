import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { catchError, map, of, Subject, switchMap } from 'rxjs';

import { PatientsService } from './data/patients.service';
import { AuthService } from '../../core/services/auth.service';
import { RegistryKind, RegistryService } from '../../core/services/registry.service';
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
import { LoadError } from '../../shared/components/load-error';
import { PbAvatar, PbButton, PbStatusChip, PbSurface } from '../../shared/ui';
import type { DataIssue, Patient, RegistryRef } from './data/patient.model';
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
    LoadError,
    PbButton,
    PbSurface,
    PbAvatar,
    PbStatusChip,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './patient-detail.html',
  styleUrl: './patient-detail.scss',
})
export class PatientDetail {
  private readonly service = inject(PatientsService);
  private readonly registry = inject(RegistryService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly breakpoints = inject(BreakpointObserver);
  protected readonly auth = inject(AuthService);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  /**
   * M3 primary tabs stretch to fill the row only at compact width; on a wide
   * page they sit start-aligned at their natural width, or three tabs end up
   * 300px each with the labels lost in the middle.
   */
  protected readonly isCompact = toSignal(
    this.breakpoints.observe('(max-width: 700px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly genderLabel = genderLabel;
  protected readonly genderIcon = genderIcon;
  protected readonly educationLabel = educationLabel;
  protected readonly caseStatusLabel = caseStatusLabel;
  protected readonly color = treatmentColor;

  protected readonly loading = signal(true);
  protected readonly patient = signal<Patient | null>(null);
  protected readonly history = signal<AuditEntry[]>([]);
  /**
   * Kept apart from the entries themselves: an empty list means "nothing
   * ever changed" only once a load has actually come back.
   */
  protected readonly historyState = signal<'idle' | 'loading' | 'loaded' | 'failed'>('idle');

  /** Grouped for the "details" tab, skipping anything the record does not hold. */
  protected readonly detailRows = computed(() => {
    this.i18n.currentLang();
    const p = this.patient();
    if (!p) return [];
    const rows: { icon: string; label: string; value: string; ltr?: boolean }[] = [];
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

  /**
   * One `switchMap` for every load, so going straight from one patient to the
   * next cancels the first request instead of letting a slow response for the
   * old id arrive after the new one and show the wrong patient.
   */
  private readonly load$ = new Subject<string>();

  /**
   * Same shape for the history tab: a slow response for the previous patient
   * must not land under the next one's heading.
   */
  private readonly history$ = new Subject<string>();

  constructor() {
    this.load$
      .pipe(
        switchMap((id) =>
          this.service.get(id).pipe(
            map((patient) => ({ id, patient })),
            catchError(() => of({ id, patient: null })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ id, patient }) => {
        // Belt and braces on top of switchMap: never show a record for a route
        // this component has since left.
        if (id !== this.id()) return;
        this.loading.set(false);
        if (!patient) {
          void this.router.navigate(['/patients']);
          return;
        }
        this.patient.set(patient);
      });

    this.history$
      .pipe(
        switchMap((id) =>
          this.service.history(id).pipe(
            map((entries) => ({ id, entries, failed: false })),
            catchError(() => of({ id, entries: [] as AuditEntry[], failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ id, entries, failed }) => {
        if (id !== this.id()) return;
        this.history.set(entries);
        this.historyState.set(failed ? 'failed' : 'loaded');
      });

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
    // A different record from the one on screen: take the old one down rather
    // than leave its buttons live while the new one is in flight. An action
    // taken in that window would pair the new route id with the old patient.
    if (this.patient()?.id !== id) this.patient.set(null);
    this.history.set([]);
    this.historyState.set('idle');
    this.load$.next(id);
  }

  /**
   * False once the screen has moved on to another record. A late response
   * for the old one must neither be shown nor acted on here.
   */
  private stillShowing(patientId: string): boolean {
    return this.id() === patientId;
  }

  /** Renders an import flag in the reader's language, from its code. */
  protected issueMessage(issue: DataIssue): string {
    return this.errors.forCode(issue.code, issue.params);
  }

  protected loadHistory(): void {
    if (this.historyState() !== 'idle' || !this.auth.can('viewHistory')) return;
    this.historyState.set('loading');
    this.history$.next(this.id());
  }

  protected retryHistory(): void {
    this.historyState.set('idle');
    this.loadHistory();
  }

  /** Dismiss an import warning once staff have checked the underlying value. */
  protected resolveIssue(field: string): void {
    // The record the warning belongs to, not the route: the two differ while
    // a navigation to another patient is still loading.
    const p = this.patient();
    if (!p) return;
    this.service.resolveIssue(p.id, field).subscribe((patient) => {
      if (!this.stillShowing(patient.id)) return;
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
          if (!this.stillShowing(p.id)) return;
          this.snackBar.open(
            this.i18n.instant('archive.done'),
            this.i18n.instant('action.dismiss'),
          );
          void this.router.navigate(['/patients']);
        });
      });
  }

  protected restore(): void {
    const p = this.patient();
    if (!p) return;
    this.service.restore(p.id).subscribe((patient) => {
      if (!this.stillShowing(patient.id)) return;
      this.patient.set(patient);
      this.snackBar.open(
        this.i18n.instant('archive.restored'),
        this.i18n.instant('action.dismiss'),
      );
    });
  }

  /** Opens a new ortho or implant پرونده already linked to this patient. */
  protected addCase(kind: RegistryKind): void {
    const p = this.patient();
    if (!p) return;
    const data: RegistryCaseDialogData = {
      mode: 'create',
      kind,
      patient: { id: p.id, name: p.fullName, mobile: p.mobile, homePhone: p.homePhone },
    };
    this.openCaseDialog(data, p.id, () =>
      this.i18n.instant(
        kind === 'ortho' ? 'patientDetail.orthoCaseCreated' : 'patientDetail.implantCaseCreated',
      ),
    );
  }

  /**
   * Corrects one of this patient's register entries. The page only holds the
   * number and status, so the full row is fetched first; the dialog needs the
   * rest to show what it is about to change.
   */
  protected editCase(kind: RegistryKind, ref: RegistryRef): void {
    const p = this.patient();
    if (!p) return;
    this.registry.getCase(kind, ref.id).subscribe((existing) => {
      const data: RegistryCaseDialogData = { mode: 'edit', kind, existing };
      this.openCaseDialog(data, p.id, () => this.i18n.instant('registryForm.saved'));
    });
  }

  private openCaseDialog(data: RegistryCaseDialogData, patientId: string, done: () => string): void {
    this.dialog
      .open(RegistryCaseDialog, { data, width: '480px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.snackBar.open(done(), this.i18n.instant('action.dismiss'));
        if (this.stillShowing(patientId)) this.load(patientId);
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

  protected changeEntries(changes: AuditEntry['changes']): [string, unknown][] {
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
