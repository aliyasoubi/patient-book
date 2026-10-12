import type { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { jawTeeth, teethSummary, teethByQuadrant, toothRuns } from './teeth';

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
