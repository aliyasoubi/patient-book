import { Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { PatientsService } from '../patients/data/patients.service';
import { roleLabel } from '../../shared/labels';
import { PbButton, PbPageHeader, PbSurface } from '../../shared/ui';
import type { TreatmentType } from '../patients/data/patient.model';

/**
 * Appearance, account and the treatment catalogue. Backups and the Excel
 * export/reconcile tools are deliberately not here: they are operated from
 * the server's terminal (see the README), not from the clinic's screens.
 */
@Component({
  selector: 'pb-settings',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    PbButton,
    PbSurface,
    PbPageHeader,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly patients = inject(PatientsService);

  protected readonly roleLabel = roleLabel;

  protected readonly treatments = signal<TreatmentType[]>([]);

  constructor() {
    this.patients.treatmentTypes().subscribe((t) => this.treatments.set(t));
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }
}
