import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiErrorTranslator } from '../../core/i18n/api-error.translator';
import { BackupService, type BackupSettings } from '../../core/services/backup.service';
import { AuthService } from '../../core/services/auth.service';
import { PaletteService, PaletteName } from '../../core/services/palette.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { PatientsService } from '../patients/data/patients.service';
import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';
import { referralKindIcon, referralKindLabel, roleLabel } from '../../shared/labels';
import { PbButton, PbPageHeader, PbSurface, PbTextField } from '../../shared/ui';
import type { ReferralSource, TreatmentType } from '../patients/data/patient.model';

@Component({
  selector: 'pb-settings',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    ReactiveFormsModule,
    PersianCountPipe,
    PbButton,
    PbSurface,
    PbPageHeader,
    PbTextField,
    MatIconModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(PaletteService);
  private readonly patients = inject(PatientsService);
  private readonly backups = inject(BackupService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly errors = inject(ApiErrorTranslator);
  private readonly i18n = inject(TranslateService);

  protected readonly paletteNames: readonly PaletteName[] = ['cyan', 'green', 'violet'];

  protected readonly roleLabel = roleLabel;
  protected readonly referralKindLabel = referralKindLabel;
  protected readonly referralKindIcon = referralKindIcon;

  protected readonly treatments = signal<TreatmentType[]>([]);
  protected readonly referrals = signal<ReferralSource[]>([]);

  constructor() {
    // Only an admin can read backup settings; asking as anyone else would just
    // produce a 403 in the console on every settings visit.
    if (this.auth.can('manageData')) this.loadBackupSettings();
    this.patients.treatmentTypes().subscribe((t) => this.treatments.set(t));
    this.patients
      .referralSources()
      .subscribe((r) =>
        this.referrals.set(
          [...r].sort((a, b) => (b.patientCount ?? 0) - (a.patientCount ?? 0)).slice(0, 30),
        ),
      );
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }

  protected setPalette(palette: PaletteName): void {
    this.palette.set(palette);
  }

  // ── Backup destination ──────────────────────────────────────────

  protected readonly backupDir = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly backup = signal<BackupSettings | null>(null);
  protected readonly savingBackup = signal(false);

  private loadBackupSettings(): void {
    this.backups.settings().subscribe((s) => {
      this.backup.set(s);
      this.backupDir.setValue(s.dir);
    });
  }

  protected saveBackupDir(): void {
    const dir = this.backupDir.value.trim();
    if (!dir || this.savingBackup()) return;
    this.savingBackup.set(true);
    this.backups.setDir(dir).subscribe({
      next: (s) => {
        this.backup.set(s);
        this.backupDir.setValue(s.dir);
        this.savingBackup.set(false);
        this.toast(this.i18n.instant('settings.backupDirSaved'));
      },
      // The API's reason is the useful part here — "that folder is not
      // writable" tells someone what to fix, where a generic failure does not.
      error: (error: unknown) => {
        this.savingBackup.set(false);
        this.toast(this.errors.translate(error));
      },
    });
  }

  private toast(message: string): void {
    this.snackBar.open(message, this.i18n.instant('action.dismiss'));
  }
}
