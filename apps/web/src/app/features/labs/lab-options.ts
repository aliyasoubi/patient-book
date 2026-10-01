import type { TranslateService } from '@ngx-translate/core';

import { formatPersianCount } from '../../shared/pipes/persian-number.pipe';
import {
  LAB_TRIP_KINDS,
  LAB_WAIT_DAYS,
  LAB_WORK_TYPES,
  labTripKindLabel,
  labWorkTypeLabel,
} from '../../shared/labels';
import type { FilterChipOption, SelectOption } from '../../shared/ui';

/** The turnarounds as the book wrote them — «یک هفته»، «سه هفته» — not as a count of days. */
const WAIT_LABELS: Partial<Record<number, string>> = {
  3: 'labWait.d3',
  7: 'labWait.w1',
  10: 'labWait.d10',
  14: 'labWait.w2',
  21: 'labWait.w3',
  28: 'labWait.w4',
};

/**
 * The turnaround choices, in days. A trip saved with a turnaround the list
 * does not offer keeps it as an extra option, so an edit cannot silently
 * change it.
 */
export function labWaitOptions(i18n: TranslateService, current?: number | null): SelectOption[] {
  const days: number[] = [...LAB_WAIT_DAYS];
  if (current && !days.includes(current)) days.push(current);
  return days
    .sort((a, b) => a - b)
    .map((d) => {
      const key = WAIT_LABELS[d];
      return {
        value: String(d),
        label: key
          ? i18n.instant(key)
          : i18n.instant('labWait.days', { count: formatPersianCount(d) }),
      };
    });
}

export function labTripKindOptions(): SelectOption[] {
  return LAB_TRIP_KINDS.map((kind) => ({
    value: kind,
    label: labTripKindLabel(kind),
    translate: true,
  }));
}

export function labWorkTypeOptions(): FilterChipOption[] {
  return LAB_WORK_TYPES.map((type) => ({
    value: type,
    label: labWorkTypeLabel(type),
    translate: true,
  }));
}
