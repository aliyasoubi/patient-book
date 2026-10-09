import type { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { jawTeeth, labTeethSummary, teethByQuadrant, toothRuns } from './lab-teeth';

/** Stands in for the translations the app loads, so the summary reads as it will. */
const TEXT: Record<string, string> = {
  'list.separator': ', ',
  'labTooth.q1': 'upper right',
  'labTooth.q2': 'upper left',
  'labTooth.q3': 'lower left',
  'labTooth.q4': 'lower right',
  'labTooth.range': '{{from}} to {{to}}',
  'labTooth.group': '{{quadrant}}: {{numbers}}',
  'labTooth.groupSeparator': '; ',
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

describe('labTeethSummary', () => {
  it('names each quadrant and folds a run of three or more into a range', () => {
    expect(labTeethSummary([16, 17, 21, 22, 23], i18n)).toBe(
      'upper right: ۶, ۷; upper left: ۱ to ۳',
    );
  });

  it('is empty for no teeth', () => {
    expect(labTeethSummary([], i18n)).toBe('');
  });
});
