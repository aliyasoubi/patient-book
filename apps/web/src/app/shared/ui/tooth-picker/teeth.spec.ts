import type { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import {
  PERMANENT_TOOTH_RANGE,
  chartQuadrants,
  jawTeeth,
  teethByQuadrant,
  teethByWork,
  teethSummary,
  toothRuns,
} from './teeth';

/** Stands in for the translations the app loads, so the summary reads as it will. */
const TEXT: Record<string, string> = {
  'list.separator': ', ',
  'tooth.q1': 'upper right',
  'tooth.q2': 'upper left',
  'tooth.q3': 'lower left',
  'tooth.q4': 'lower right',
  'tooth.range': '{{from}} to {{to}}',
  'tooth.group': '{{quadrant}}: {{numbers}}',
  'tooth.groupSeparator': '; ',
};
const i18n = {
  instant: (key: string, params?: Record<string, string>) =>
    Object.entries(params ?? {}).reduce((t, [k, v]) => t.replace(`{{${k}}}`, v), TEXT[key] ?? key),
} as unknown as TranslateService;

describe('toothRuns', () => {
  it('joins consecutive positions and keeps gaps apart', () => {
    expect(toothRuns([1, 2, 3, 5])).toEqual([
      [1, 3],
      [5, 5],
    ]);
    expect(toothRuns([7, 6])).toEqual([[6, 7]]);
    expect(toothRuns([])).toEqual([]);
  });
});

describe('teethByQuadrant', () => {
  it('reads the mouth in quadrant order, whatever order the teeth came in', () => {
    expect(teethByQuadrant([41, 17, 16, 21])).toEqual([
      [1, [6, 7]],
      [2, [1]],
      [4, [1]],
    ]);
  });
});

describe('jawTeeth', () => {
  it('is fourteen teeth, never the other jaw', () => {
    expect(jawTeeth('upper')).toHaveLength(14);
    expect(jawTeeth('upper').every((t) => t < 30)).toBe(true);
    expect(jawTeeth('lower').every((t) => t > 30)).toBe(true);
  });
});

describe('teethSummary', () => {
  it('names each quadrant and folds a run of three or more into a range', () => {
    expect(teethSummary([16, 17, 21, 22, 23], i18n)).toBe('upper right: ۶, ۷; upper left: ۱ to ۳');
  });

  it('is empty for no teeth', () => {
    expect(teethSummary([], i18n)).toBe('');
  });
});

describe('chartQuadrants', () => {
  it('lays the mouth out as the dentist sees it, each quadrant counting out from the midline', () => {
    const quadrants = chartQuadrants(i18n);
    expect(quadrants.map((q) => q.label)).toEqual([
      'upper right',
      'upper left',
      'lower right',
      'lower left',
    ]);
    expect(quadrants[0].teeth).toEqual([17, 16, 15, 14, 13, 12, 11]);
    expect(quadrants[1].teeth).toEqual([21, 22, 23, 24, 25, 26, 27]);
    expect(quadrants[2].teeth).toEqual([47, 46, 45, 44, 43, 42, 41]);
  });

  it('takes the wisdom teeth in at the outer end when asked for the whole set', () => {
    const quadrants = chartQuadrants(i18n, PERMANENT_TOOTH_RANGE);
    expect(quadrants[0].teeth).toEqual([18, 17, 16, 15, 14, 13, 12, 11]);
    expect(quadrants[3].teeth).toEqual([31, 32, 33, 34, 35, 36, 37, 38]);
    expect(jawTeeth('lower', PERMANENT_TOOTH_RANGE)).toHaveLength(16);
  });
});

describe('teethByWork', () => {
  it('groups the teeth by their work, in the order given, and leaves empty kinds out', () => {
    expect(
      teethByWork(
        [
          { tooth: 21, workType: 'laminate' },
          { tooth: 16, workType: 'implant_crown' },
          { tooth: 11, workType: 'laminate' },
          { tooth: 15, workType: 'crown' },
        ],
        ['crown', 'implant_crown', 'laminate', 'post'],
      ),
    ).toEqual([
      { workType: 'crown', teeth: [15] },
      { workType: 'implant_crown', teeth: [16] },
      { workType: 'laminate', teeth: [11, 21] },
    ]);
  });
});
