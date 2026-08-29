import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { DataExchangeService } from '../../core/services/data-exchange.service';
import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { ConfirmDialog, ConfirmData } from '../../shared/components/confirm-dialog';
import { fieldLabel } from '../../shared/labels';
import { PbButton, PbCheckboxField, PbPageHeader, PbSurface } from '../../shared/ui';
import type { CaseDiff, PatientDiff, ReconcilePreview } from '../../core/models/common.model';

type EntityKind = 'patients' | 'implants' | 'ortho';

@Component({
  selector: 'pb-data-exchange',
  standalone: true,
  imports: [
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    PbButton,
    PbCheckboxField,
    PbSurface,
    PbPageHeader,
    TranslatePipe,
  ],
  templateUrl: './data-exchange.html',
  styleUrl: './data-exchange.scss',
})
export class DataExchange {
  private readonly service = inject(DataExchangeService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  protected readonly fieldLabel = (key: string): string => this.i18n.instant(fieldLabel(key));

  protected readonly exporting = signal(false);
  protected readonly uploading = signal(false);
  protected readonly applying = signal(false);

  protected readonly preview = signal<ReconcilePreview | null>(null);
  protected readonly selected = signal<Record<EntityKind, Set<string>>>({
    patients: new Set(),
    implants: new Set(),
    ortho: new Set(),
  });

  protected readonly totalChanged = computed(() => {
    const p = this.preview();
    return p ? p.patients.length + p.implants.length + p.ortho.length : 0;
  });

  protected readonly selectedCount = computed(() => {
    const s = this.selected();
    return s.patients.size + s.implants.size + s.ortho.size;
  });

  protected back(): void {
    void this.router.navigate(['/settings']);
  }

  // ── Export ───────────────────────────────────────────────────────

  protected downloadExport(): void {
    this.exporting.set(true);
    this.service.exportWorkbook().subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'patient-book.xlsx';
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.snackBar.open(
          this.i18n.instant('dataExchange.exportError'),
          this.i18n.instant('action.dismiss'),
        );
      },
    });
  }

  // ── Reconcile: upload + preview ─────────────────────────────────

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.snackBar.open(
        this.i18n.instant('dataExchange.fileRejected'),
        this.i18n.instant('action.dismiss'),
      );
      return;
    }

    this.uploading.set(true);
    this.preview.set(null);
    this.service.previewReconcile(file).subscribe({
      next: (result) => {
        this.uploading.set(false);
        this.preview.set(result);
        this.selected.set({
          patients: new Set(result.patients.map((p) => p.id)),
          implants: new Set(result.implants.map((c) => c.id)),
          ortho: new Set(result.ortho.map((c) => c.id)),
        });
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'));
      },
    });
  }

  // ── Reconcile: review selection ─────────────────────────────────

  protected isSelected(kind: EntityKind, id: string): boolean {
    return this.selected()[kind].has(id);
  }

  protected toggle(kind: EntityKind, id: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current[kind]);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...current, [kind]: next };
    });
  }

  protected groupFullySelected(kind: EntityKind, ids: string[]): boolean {
    const set = this.selected()[kind];
    return ids.length > 0 && ids.every((id) => set.has(id));
  }

  protected toggleGroup(kind: EntityKind, ids: string[], checked: boolean): void {
    this.selected.update((current) => ({
      ...current,
      [kind]: checked ? new Set(ids) : new Set(),
    }));
  }

  protected patientIds(): string[] {
    return (this.preview()?.patients ?? []).map((p) => p.id);
  }

  protected implantIds(): string[] {
    return (this.preview()?.implants ?? []).map((c) => c.id);
  }

  protected orthoIds(): string[] {
    return (this.preview()?.ortho ?? []).map((c) => c.id);
  }

  // ── Reconcile: apply ─────────────────────────────────────────────

  protected confirmApply(): void {
    const count = this.selectedCount();
    if (count === 0) {
      this.snackBar.open(
        this.i18n.instant('dataExchange.noneSelected'),
        this.i18n.instant('action.dismiss'),
      );
      return;
    }

    const data: ConfirmData = {
      title: this.i18n.instant('dataExchange.applyConfirmTitle'),
      message: this.i18n.instant('dataExchange.applyConfirmMessage', { count }),
      confirmLabel: this.i18n.instant('dataExchange.applySelected'),
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.apply();
      });
  }

  private apply(): void {
    const preview = this.preview();
    if (!preview) return;
    const selected = this.selected();

    const pick = (diffs: Array<PatientDiff | CaseDiff>, ids: Set<string>) =>
      diffs
        .filter((d) => ids.has(d.id))
        .map((d) => ({
          id: d.id,
          fields: d.fields.map((f) => ({ field: f.field, proposed: f.proposed })),
        }));

    this.applying.set(true);
    this.service
      .applyReconcile({
        patients: pick(preview.patients, selected.patients),
        implants: pick(preview.implants, selected.implants),
        ortho: pick(preview.ortho, selected.ortho),
      })
      .subscribe({
        next: (result) => {
          this.applying.set(false);
          const rows = [...result.patients, ...result.implants, ...result.ortho];
          const okCount = rows.filter((r) => r.ok).length;
          const failCount = rows.length - okCount;

          this.snackBar.open(
            this.i18n.instant('dataExchange.applyDone', { count: okCount }) +
              (failCount
                ? ' ' + this.i18n.instant('dataExchange.applyPartialFail', { count: failCount })
                : ''),
            this.i18n.instant('action.dismiss'),
            { duration: 8000 },
          );

          // Drop applied rows from the review list; keep failures visible for retry.
          const okIds = new Set(rows.filter((r) => r.ok).map((r) => r.id));
          this.preview.set({
            patients: preview.patients.filter((p) => !okIds.has(p.id)),
            implants: preview.implants.filter((c) => !okIds.has(c.id)),
            ortho: preview.ortho.filter((c) => !okIds.has(c.id)),
            unmatched: preview.unmatched,
          });
          this.selected.set({
            patients: new Set([...selected.patients].filter((id) => !okIds.has(id))),
            implants: new Set([...selected.implants].filter((id) => !okIds.has(id))),
            ortho: new Set([...selected.ortho].filter((id) => !okIds.has(id))),
          });
        },
        error: (error: unknown) => {
          this.applying.set(false);
          this.snackBar.open(this.errors.translate(error), this.i18n.instant('action.dismiss'));
        },
      });
  }
}
