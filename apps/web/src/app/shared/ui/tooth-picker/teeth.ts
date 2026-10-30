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

/**
 * The words the books name a tooth's place by, typos they carry included:
 * the jaw, the side, both sides, and a position written out.
 */
const UPPER = /^(بالا|بلا|فوقانی|ماگزیلا|upper)$/;
const LOWER = /^(پایین|پائین|پایی|تحتانی|مندیبل|lower)$/;
const RIGHT = /^(راست|right)$/;
const LEFT = /^(چپ|left)$/;
/** «هر دو طرف», folded to one token before reading. */
const BOTH_SIDES = /^bothsides$/;
/** One to seven, written out, in order. */
const NUMBER_WORDS = [/^یک$/, /^دو$/, /^سه$/, /^چهار$/, /^پنج$/, /^شش$/, /^هفت$/];
/** «واحد»: the number before it counted implants, and named no tooth. */
const UNITS = /^واحد$/;
/** «و» glued to the word after it. */
const GLUED_AND = /^و(.+)$/;

/** Teeth a phrase names together: their positions, and the jaws and sides they share. */
interface PhraseGroup {
  positions: number[];
  jaws: Set<'upper' | 'lower'>;
  sides: Set<'right' | 'left'>;
  /** Named after its positions («۶ و ۷ راست پایین»): the next number starts another. */
  closed: boolean;
}

/** What one word says of where a tooth is: its jaw, or its side or sides. */
interface Place {
  jaw?: 'upper' | 'lower';
  sides?: ('right' | 'left')[];
}

/** Where a word puts a tooth, if anywhere — «وچپ» is «و» glued to «چپ». */
function placeOf(word: string): Place | null {
  const glued = GLUED_AND.exec(word);
  for (const w of glued ? [word, glued[1]] : [word]) {
    if (UPPER.test(w)) return { jaw: 'upper' };
    if (LOWER.test(w)) return { jaw: 'lower' };
    if (RIGHT.test(w)) return { sides: ['right'] };
    if (LEFT.test(w)) return { sides: ['left'] };
    if (BOTH_SIDES.test(w)) return { sides: ['right', 'left'] };
  }
  return null;
}

/**
 * The teeth a phrase written before the chart names, as FDI numbers — «زیمر،
 * ۶ و ۷ راست پایین» is 46 and 47, «۶ های بالا هر دو طرف» 16 and 26 — or none
 * when it cannot be read for certain: a position with no jaw or no side
 * («۶ بالا»), a size («۴.۱»), a count («دوتا سه»), a tooth the chart does not
 * hold. Brands and what was done («زیمر»، «فرش ساکت») are passed over; a
 * count of implants («یک واحد») is not a tooth. Numbers glued together
 * («56 بالا چپ») are positions when the phrase names a jaw or side, and FDI
 * numbers («۳۶») when it names neither.
 */
export function teethFromPhrase(phrase: string | null | undefined): number[] {
  if (!phrase) return [];
  const text = toLatinDigits(phrase)
    // Arabic yeh and kaf, as Persian ones: by code, not as literal text.
    .replace(/ي/g, String.fromCharCode(0x06cc))
    .replace(/ك/g, String.fromCharCode(0x06a9))
    .replace(/\u200c/g, '')
    // «،» and «؛» sit in the Arabic block with the letters, and would glue to them.
    .replace(/[،؛؟]/g, ' ')
    .toLowerCase()
    // «هر دو طرف», «هر دو سمت»: both sides, one word, so «دو» is no position.
    .replace(/هر\s*دو(\s*(طرف|سمت))?/g, ' bothsides ')
    // «سمت» glues to the jaw before it («بالاسمت»).
    .replace(/سمت/g, ' ');
  // «۴.۱» or «۳/۵» is an implant's size; «دوتا سه» counts, and on both sides.
  if (/\d\s*[./]\s*\d/.test(text) || /(^|\s)(دو|سه|چهار|پنج)\s*تا/.test(text)) return [];

  const tokens = text.match(/\d+|[؀-ۿ]+|[a-z]+/g) ?? [];
  const named = tokens.some((t) => /^\D/.test(t) && placeOf(t));
  const teeth = new Set<number>();
  const groups: PhraseGroup[] = [];
  let group: PhraseGroup | null = null;
  const start = (): PhraseGroup => {
    const next: PhraseGroup = { positions: [], jaws: new Set(), sides: new Set(), closed: false };
    groups.push(next);
    return next;
  };
  const isNamed = (g: PhraseGroup) => g.jaws.size > 0 && g.sides.size > 0;

  for (const token of tokens) {
    const word = NUMBER_WORDS.findIndex((written) => written.test(token));
    if (/^\d+$/.test(token) || word !== -1) {
      let positions: number[];
      if (word !== -1) {
        positions = [word + 1];
      } else if (token.length === 1) {
        positions = [Number(token)];
      } else if (named) {
        // «56 بالا چپ»: the 5 and the 6.
        positions = [...token].map(Number);
      } else {
        const n = Number(token);
        if (quadrantOf(n) < 1 || quadrantOf(n) > 4 || !TOOTH_RANGE.includes(n % 10)) return [];
        teeth.add(n);
        continue;
      }
      if (positions.some((p) => !TOOTH_RANGE.includes(p))) return [];
      // Named first («راست پایین ۶ و ۷»), a group takes numbers until a word.
      if (!group || group.closed) group = start();
      group.positions.push(...positions);
      continue;
    }
    // «یک واحد ایمپلنت»: a count, not a tooth.
    if (UNITS.test(token)) {
      group?.positions.pop();
      continue;
    }
    const place = placeOf(token);
    // «و», a brand, «فرش ساکت»: nothing about where.
    if (!place) continue;
    // A word after a named group's positions names the next group — unless
    // the group was named after them, and this adds to it («راست و چپ»).
    if (!group || (!group.closed && group.positions.length && isNamed(group))) group = start();
    if (place.jaw) group.jaws.add(place.jaw);
    for (const side of place.sides ?? []) group.sides.add(side);
    if (group.positions.length && isNamed(group)) group.closed = true;
  }

  for (const g of groups) {
    if (!g.positions.length) continue;
    if (!isNamed(g)) return [];
    for (const jaw of g.jaws) {
      for (const side of g.sides) {
        const quadrant = jaw === 'upper' ? (side === 'right' ? 1 : 2) : side === 'right' ? 4 : 3;
        for (const position of g.positions) teeth.add(quadrant * 10 + position);
      }
    }
  }
  return [...teeth].sort((a, b) => a - b);
}
