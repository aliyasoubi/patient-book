import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AgoPipe } from '../../shared/pipes/ago.pipe';
import { JalaliPipe } from '../../shared/pipes/jalali.pipe';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PbIcon } from '../../shared/ui/icon/icon';
import type { Patient } from './data/patient.model';

/**
 * A patient's record at a glance, under their name: when they were last
 * seen, what they have had done, and how many follow-ups and lab cases are on
 * file — the questions asked before anyone opens a tab.
 */
@Component({
  selector: 'pb-patient-glance',
  standalone: true,
  imports: [AgoPipe, JalaliPipe, PersianNumberPipe, PbIcon, TranslatePipe],
  templateUrl: './patient-glance.html',
  styleUrl: './patient-glance.scss',
})
export class PatientGlance {
  readonly patient = input.required<Patient>();
  readonly treatmentNames = input('');
  readonly followUps = input(0);
  readonly labCases = input(0);
}

/**
 * The four facts before the file has loaded: the same tiles (it shares
 * PatientGlance's stylesheet), each with the shape of its icon, label,
 * value and line.
 */
@Component({
  selector: 'pb-patient-glance-skeleton',
  standalone: true,
  template: `
    <section class="glance" aria-hidden="true">
      @for (i of [0, 1, 2, 3]; track i) {
        <div class="glance__item" [style.--skel-i]="i">
          <span class="pb-skel" style="--w: 34px; --h: 34px; --r: 10px"></span>
          <span class="pb-skel" style="--w: 50%; --h: 11px"></span>
          <span class="pb-skel" style="--w: 36%; --h: 20px"></span>
          <span class="pb-skel" style="--w: 70%; --h: 10px"></span>
        </div>
      }
    </section>
  `,
  styleUrl: './patient-glance.scss',
})
export class PatientGlanceSkeleton {}
