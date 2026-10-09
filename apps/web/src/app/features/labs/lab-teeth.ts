import type { TranslateService } from '@ngx-translate/core';

import { formatPersianNumber } from '../../shared/pipes/persian-number.pipe';

/**
 * Teeth as the lab form and the cards know them: FDI numbers (ISO 3950).
 * The tens digit is the quadrant — 1 upper right, 2 upper left, 3 lower left,
 * 4 lower right, by the patient's own sides — and the ones digit the tooth,
 * 1 at the midline to 7. The practice says "6 upper right" for `16`.
 */
export type Quadrant = 1 | 2 | 3 | 4;

export const TOOTH_RANGE: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/** Literal keys, not a template, so the i18n check sees every one. */
export const QUADRANT_LABELS: Record<Quadrant, string> = {
  1: 'labTooth.q1',
  2: 'labTooth.q2',
  3: 'labTooth.q3',
  4: 'labTooth.q4',
};

export const quadrantOf = (tooth: number): Quadrant => Math.floor(tooth / 10) as Quadrant;
export const positionOf = (tooth: number): number => tooth % 10;

/** Every tooth of one jaw: quadrants 1 and 2 are the upper, 3 and 4 the lower. */
export function jawTeeth(jaw: 'upper' | 'lower'): number[] {
  const quadrants: Quadrant[] = jaw === 'upper' ? [1, 2] : [3, 4];
  return quadrants.flatMap((q) => TOOTH_RANGE.map((n) => q * 10 + n));
}

/** Runs of consecutive tooth positions: [1,2,3,5] → [[1,3],[5,5]]. */
export function toothRuns(positions: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const position of [...positions].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && position === last[1] + 1) last[1] = position;
    else runs.push([position, position]);
  }
  return runs;
}

/** The chosen teeth by quadrant, in the order the mouth is read: 1, 2, 3, 4. */
export function teethByQuadrant(teeth: readonly number[]): [Quadrant, number[]][] {
  const groups: [Quadrant, number[]][] = [];
  for (const quadrant of [1, 2, 3, 4] as const) {
    const positions = teeth.filter((t) => quadrantOf(t) === quadrant).map(positionOf);
    if (positions.length) groups.push([quadrant, positions.sort((a, b) => a - b)]);
  }
  return groups;
}

/**
 * "Upper right: 6, 7; upper left: 1 to 3" — a run of three or more reads as a
 * range, so a laminate set does not turn into a column of numbers.
 */
export function labTeethSummary(teeth: readonly number[], i18n: TranslateService): string {
  const separator = i18n.instant('list.separator');
  return teethByQuadrant(teeth)
    .map(([quadrant, positions]) => {
      const numbers = toothRuns(positions)
        .flatMap(([from, to]) =>
          to - from >= 2
            ? [
                i18n.instant('labTooth.range', {
                  from: formatPersianNumber(from),
                  to: formatPersianNumber(to),
                }),
              ]
            : Array.from({ length: to - from + 1 }, (_, i) => formatPersianNumber(from + i)),
        )
        .join(separator);
      return i18n.instant('labTooth.group', {
        quadrant: i18n.instant(QUADRANT_LABELS[quadrant]),
        numbers,
      });
    })
    .join(i18n.instant('labTooth.groupSeparator'));
}
