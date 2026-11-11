import { Component, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import { PersianCountPipe } from '../../shared/pipes/persian-number.pipe';
import { PbIcon } from '../../shared/ui';
import type { TreatmentType } from '../patients/data/patient.model';

/**
 * The treatments a patient file can record, folded under the statistics:
 * a heading with how many, opening on its own height to the full list.
 */
@Component({
  selector: 'pb-stats-catalogue',
  standalone: true,
  imports: [MatIconModule, PersianCountPipe, PbIcon, TranslatePipe],
  templateUrl: './stats-catalogue.html',
  styleUrl: './stats-catalogue.scss',
})
export class StatsCatalogue {
  readonly types = input.required<TreatmentType[]>();
  protected readonly open = signal(false);
}
