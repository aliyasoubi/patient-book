import { Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { PatientsService } from '../../core/services/patients.service';
import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';
import { referralKindIcon, referralKindLabel, roleLabel } from '../../shared/labels';
import { PbButton, PbPageHeader, PbSurface } from '../../shared/ui';
import type { ReferralSource, TreatmentType } from '../../core/models/patient.model';

@Component({
  selector: 'pb-settings',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    PersianCountPipe,
    PbButton,
    PbSurface,
    PbPageHeader,
    MatIconModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly patients = inject(PatientsService);

  protected readonly roleLabel = roleLabel;
  protected readonly referralKindLabel = referralKindLabel;
  protected readonly referralKindIcon = referralKindIcon;

  protected readonly treatments = signal<TreatmentType[]>([]);
  protected readonly referrals = signal<ReferralSource[]>([]);

  constructor() {
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
}
