import { describe, expect, it } from 'vitest';
import type { TranslateService } from '@ngx-translate/core';

import type { LabTrip } from '../../core/models/common.model';
import { defaultLabWaitDays } from '../../shared/labels';
import { labWaitOptions } from './lab-options';
import { suggestedTripKind } from './lab-send-dialog';

/** Echoes the key and its params, so a test reads what would be translated. */
const i18n = {
  instant: (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
} as unknown as TranslateService;

const trip = (sequence: number): LabTrip => ({
  id: `t${sequence}`,
  sequence,
  kind: 'impression',
  sentAt: '1405/07/01',
  waitDays: 7,
  expectedAt: '1405/07/08',
  receivedAt: '1405/07/08',
  note: null,
});

describe('defaultLabWaitDays', () => {
  it('is three weeks for laminates, alone or with other work, and a week otherwise', () => {
    expect(defaultLabWaitDays(['laminate'])).toBe(21);
    expect(defaultLabWaitDays(['implant_crown', 'laminate'])).toBe(21);
    expect(defaultLabWaitDays(['crown'])).toBe(7);
    expect(defaultLabWaitDays([])).toBe(7);
  });
});

describe('labWaitOptions', () => {
  it('names the turnarounds the way the book did, in order', () => {
    expect(labWaitOptions(i18n).map((o) => [o.value, o.label])).toEqual([
      ['3', 'labWait.d3'],
      ['7', 'labWait.w1'],
      ['10', 'labWait.d10'],
      ['14', 'labWait.w2'],
      ['21', 'labWait.w3'],
      ['28', 'labWait.w4'],
    ]);
  });

  it('keeps a saved turnaround the list does not offer, so an edit cannot change it unseen', () => {
    const options = labWaitOptions(i18n, 5);
    expect(options.map((o) => o.value)).toEqual(['3', '5', '7', '10', '14', '21', '28']);
    expect(options[1].label).toBe('labWait.days:۵');
  });
});

describe('suggestedTripKind', () => {
  it('offers the try-in after the first trip: resin for laminates, the frame for the rest', () => {
    expect(suggestedTripKind({ workTypes: ['laminate'], trips: [trip(1)] })).toBe('resin');
    expect(suggestedTripKind({ workTypes: ['crown'], trips: [trip(1)] })).toBe('frame');
  });

  it('offers a correction once the try-in has been', () => {
    expect(suggestedTripKind({ workTypes: ['crown'], trips: [trip(1), trip(2)] })).toBe(
      'correction',
    );
  });
});
