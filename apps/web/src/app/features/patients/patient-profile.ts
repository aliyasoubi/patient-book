import { Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { educationLabel } from '../../shared/labels';
import { timeAgo } from '../../shared/pipes/ago.pipe';
import { JalaliPipe } from '../../shared/pipes/jalali.pipe';
import { formatPersianCount, PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PhonePipe } from '../../shared/pipes/phone.pipe';
import { ToastService } from '../../shared/ui';
import { PbIcon } from '../../shared/ui/icon/icon';
import type { LineIconName } from '../../shared/ui/icon/line-icons';
import type { Patient } from './data/patient.model';

interface Detail {
  icon: LineIconName;
  label: string;
  value: string | null;
  ltr?: boolean;
}

/**
 * Who the patient is, at the side of their page, in the order the desk
 * reaches for it: how to reach them first — the mobile large, a tap to call
 * or copy it — then the details as a two-sided list, label and value each on
 * their own edge so the column reads straight down, then their visits as a
 * small span from the first to the last.
 */
@Component({
  selector: 'pb-patient-profile',
  standalone: true,
  imports: [JalaliPipe, PersianNumberPipe, PhonePipe, PbIcon, TranslatePipe],
  templateUrl: './patient-profile.html',
  styleUrl: './patient-profile.scss',
})
export class PatientProfile {
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly patient = input.required<Patient>();

  protected readonly details = computed<Detail[]>(() => {
    this.i18n.currentLang();
    const p = this.patient();
    const education =
      p.education !== 'unknown' ? this.i18n.instant(educationLabel(p.education)) : p.educationRaw;
    return [
      { icon: 'id', label: 'field.nationalId', value: p.nationalId, ltr: true },
      { icon: 'user', label: 'field.fatherName', value: p.fatherName },
      { icon: 'briefcase', label: 'field.occupation', value: p.occupation },
      { icon: 'school', label: 'field.education', value: education },
      { icon: 'share', label: 'field.referralSource', value: p.referralSource?.name ?? null },
    ];
  });

  protected readonly firstAgo = computed(() => timeAgo(this.patient().firstVisitAt, this.i18n));
  protected readonly lastAgo = computed(() => timeAgo(this.patient().lastVisitAt, this.i18n));

  /** How long they have been coming: from the first visit to the last. */
  protected readonly span = computed(() => {
    const { firstVisitAt, lastVisitAt } = this.patient();
    if (!firstVisitAt?.iso || !lastVisitAt?.iso) return null;
    const months = Math.round(
      (new Date(lastVisitAt.iso).getTime() - new Date(firstVisitAt.iso).getTime()) /
        (30.44 * 86_400_000),
    );
    if (months < 1) return null;
    return months >= 12
      ? this.i18n.instant('patientProfile.span', {
          years: formatPersianCount(Math.floor(months / 12)),
        })
      : this.i18n.instant('patientProfile.spanMonths', { months: formatPersianCount(months) });
  });

  protected copy(number: string): void {
    void navigator.clipboard?.writeText(number).then(
      () => this.toast.success(this.i18n.instant('patientProfile.copied')),
      () => undefined,
    );
  }
}
