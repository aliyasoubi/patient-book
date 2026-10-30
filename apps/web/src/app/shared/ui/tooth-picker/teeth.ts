import type { TranslateService } from '@ngx-translate/core';

import { formatPersianNumber } from '../../pipes/persian-number.pipe';
import { toLatinDigits } from '../../validators';

/**
 * Teeth as the lab and surgery forms and their cards know them: FDI numbers (ISO 3950).
 * The tens digit is the quadrant — 1 upper right, 2 upper left, 3 lower left,
 * 4 lower right, by the patient's own sides — and the ones digit the tooth,
 * 1 at the midline to 7. The practice says "6 upper right" for `16`.
 */
export type Quadrant = 1 | 2 | 3 | 4;

export const TOOTH_RANGE: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/** Literal keys, not a template, so the i18n check sees every one. */
export const QUADRANT_LABELS: Record<Quadrant, string> = {
  1: 'tooth.q1',
  2: 'tooth.q2',
  3: 'tooth.q3',
  4: 'tooth.q4',
};

export const quadrantOf = (tooth: number): Quadrant => Math.floor(tooth / 10) as Quadrant;
export const positionOf = (tooth: number): number => tooth % 10;

/** One quadrant as the chart draws it. */
export interface QuadrantView {
  id: Quadrant;
  label: string;
  /** FDI numbers in the order they sit on screen. */
  teeth: number[];
}

/**
 * The chart's quadrants as the dentist sees the mouth: upper right, upper
 * left, lower right, lower left, the patient's right on the viewer's left and
 * each quadrant counting out from the midline — 7…1 | 1…7.
 */
export function chartQuadrants(i18n: TranslateService): QuadrantView[] {
  return ([1, 2, 4, 3] as const).map((id) => {
    const fromMidline = TOOTH_RANGE.map((n) => id * 10 + n);
    const onViewersLeft = id === 1 || id === 4;
    return {
      id,
      label: i18n.instant(QUADRANT_LABELS[id]),
      teeth: onViewersLeft ? fromMidline.reverse() : fromMidline,
    };
  });
}

/** "6 upper right": a tooth as the practice says it, for a screen reader. */
export function toothName(tooth: number, i18n: TranslateService): string {
  return `${positionOf(tooth)} ${i18n.instant(QUADRANT_LABELS[quadrantOf(tooth)])}`;
}

/**
 * One tooth and the work it gets — a crown on 14, a laminate on 11 — the way
 * a lab prescription marks each tooth of its chart.
 */
export interface ToothWork<T extends string = string> {
  tooth: number;
  workType: T;
}

/** The teeth of each kind of work, kinds in the order given, teeth sorted; empty kinds left out. */
export function teethByWork<T extends string>(
  work: readonly ToothWork<T>[],
  order: readonly T[],
): { workType: T; teeth: number[] }[] {
  return order
    .map((workType) => ({
      workType,
      teeth: work
        .filter((w) => w.workType === workType)
        .map((w) => w.tooth)
        .sort((a, b) => a - b),
    }))
    .filter((group) => group.teeth.length);
}

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
export function teethSummary(teeth: readonly number[], i18n: TranslateService): string {
  const separator = i18n.instant('list.separator');
  return teethByQuadrant(teeth)
    .map(([quadrant, positions]) => {
      const numbers = toothRuns(positions)
        .flatMap(([from, to]) =>
          to - from >= 2
            ? [
                i18n.instant('tooth.range', {
                  from: formatPersianNumber(from),
                  to: formatPersianNumber(to),
                }),
              ]
            : Array.from({ length: to - from + 1 }, (_, i) => formatPersianNumber(from + i)),
        )
        .join(separator);
      return i18n.instant('tooth.group', {
        quadrant: i18n.instant(QUADRANT_LABELS[quadrant]),
        numbers,
      });
    })
    .join(i18n.instant('tooth.groupSeparator'));
}

/** The jaw and the side a phrase written before the chart names a tooth by. */
const UPPER = /^(بالا|فوقانی|ماگزیلا|upper)$/;
const LOWER = /^(پایین|پائین|تحتانی|مندیبل|lower)$/;
const RIGHT = /^(راست|right)$/;
const LEFT = /^(چپ|left)$/;

/** Teeth a phrase names together: their positions, and the jaw and side they share. */
interface PhraseGroup {
  positions: number[];
  upper?: boolean;
  right?: boolean;
  /** Named after its positions («۶ و ۷ راست پایین»): the next number starts another. */
  closed?: boolean;
}

/**
 * The teeth a phrase written before the chart names, as FDI numbers —
 * «زیمر، ۶ و ۷ راست پایین» is 46 and 47 — or none when it cannot be read for
 * certain: a position with no jaw or no side («۶ بالا»), a size («۴.۱»), a
 * tooth the chart does not hold. A number already in FDI («۳۶») is taken as
 * it is. The brand the books lead with, up to the first comma, is passed over.
 */
export function teethFromPhrase(phrase: string | null | undefined): number[] {
  if (!phrase) return [];
  let text = toLatinDigits(phrase)
    // Arabic yeh and kaf, as Persian ones: by code, not as literal text.
    .replace(/ي/g, String.fromCharCode(0x06cc))
    .replace(/ك/g, String.fromCharCode(0x06a9))
    .replace(/\u200c/g, ' ')
    .toLowerCase();
  const comma = text.search(/[,،]/);
  if (comma !== -1 && !/\d/.test(text.slice(0, comma))) text = text.slice(comma + 1);
  // «۴.۱» or «۳/۵» is an implant's size, and its numbers no tooth.
  if (/\d\s*[./]\s*\d/.test(text)) return [];

  const teeth = new Set<number>();
  const groups: PhraseGroup[] = [];
  let group: PhraseGroup | null = null;
  const named = (g: PhraseGroup) => g.upper !== undefined && g.right !== undefined;
  const start = (): PhraseGroup => {
    const next: PhraseGroup = { positions: [] };
    groups.push(next);
    return next;
  };

  for (const token of text.match(/\d+|[^\s\d,،؛;:+\-–()]+/g) ?? []) {
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n >= 10 && quadrantOf(n) >= 1 && quadrantOf(n) <= 4 && TOOTH_RANGE.includes(n % 10)) {
        teeth.add(n);
      } else if (TOOTH_RANGE.includes(n)) {
        // Named first («راست پایین ۶ و ۷»), a group takes numbers until a word.
        if (!group || group.closed) group = start();
        group.positions.push(n);
      } else {
        return [];
      }
      continue;
    }
    const upper = UPPER.test(token) ? true : LOWER.test(token) ? false : undefined;
    const right = RIGHT.test(token) ? true : LEFT.test(token) ? false : undefined;
    // «و», a brand, «دندان»: nothing about where.
    if (upper === undefined && right === undefined) continue;
    // A word after a named group's positions names the next group.
    if (!group || (group.positions.length && named(group))) group = start();
    const g = group;
    if (upper !== undefined) {
      if (g.upper !== undefined && g.upper !== upper) return [];
      g.upper = upper;
    }
    if (right !== undefined) {
      if (g.right !== undefined && g.right !== right) return [];
      g.right = right;
    }
    if (g.positions.length && named(g)) g.closed = true;
  }

  for (const g of groups) {
    if (!g.positions.length) continue;
    if (!named(g)) return [];
    const quadrant = g.upper ? (g.right ? 1 : 2) : g.right ? 4 : 3;
    for (const position of g.positions) teeth.add(quadrant * 10 + position);
  }
  return [...teeth].sort((a, b) => a - b);
}
