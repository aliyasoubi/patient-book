import { Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { PaletteService, PaletteName } from '../../core/services/palette.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { PatientsService } from '../patients/data/patients.service';
import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';
import { referralKindIcon, referralKindLabel, roleLabel } from '../../shared/labels';
import { PbButton, PbPageHeader, PbSurface } from '../../shared/ui';
import type { ReferralSource, TreatmentType } from '../patients/data/patient.model';

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

  protected readonly paletteNames: readonly PaletteName[] = ['cyan', 'green', 'violet'];

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

  protected setPalette(palette: PaletteName): void {
    this.palette.set(palette);
  }
}
