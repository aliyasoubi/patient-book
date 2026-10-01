import { describe, expect, it } from '@jest/globals';

import {
  expectedReturn,
  labStage,
  latestTrip,
  openTrip,
  timeliness,
} from './lab-stage';
import { JalaliDate } from '../../domain';

// "Now" is 9 Mehr 1405 (1 October 2026) for every case here.
const now = new Date(2026, 9, 1);
const d = (jalaliDate: string): Date => JalaliDate.parse(jalaliDate).date;
const iso = (date: Date): string => JalaliDate.fromDate(date)!.toIsoDate();

const trip = (sequence: number, receivedAt: Date | null = null) => ({
  sequence,
  receivedAt,
});

describe('labStage', () => {
  it('is at the lab while a trip is out, whatever went before', () => {
    expect(labStage({ deliveredAt: null, trips: [trip(1)] })).toBe('at_lab');
    expect(
      labStage({
        deliveredAt: null,
        trips: [trip(1, d('1405/07/01')), trip(2)],
      }),
    ).toBe('at_lab');
  });

  it('is back at the clinic once every trip has come back', () => {
    expect(
      labStage({
        deliveredAt: null,
        trips: [trip(1, d('1405/07/01')), trip(2, d('1405/07/08'))],
      }),
    ).toBe('at_clinic');
  });

  it('is delivered once fitted, and nothing else then matters', () => {
    expect(labStage({ deliveredAt: d('1405/07/09'), trips: [trip(1)] })).toBe(
      'delivered',
    );
  });
});

describe('openTrip and latestTrip', () => {
  const back = trip(1, d('1405/07/01'));
  const out = trip(2);

  it('finds the trip out, in any order', () => {
    expect(openTrip([out, back])).toBe(out);
    expect(openTrip([back])).toBeNull();
  });

  it('takes the latest by sequence, not by position', () => {
    expect(latestTrip([out, back])).toBe(out);
    expect(latestTrip([])).toBeNull();
  });
});

describe('expectedReturn', () => {
  it('counts calendar days across a Jalali month end', () => {
    // Shahrivar has 31 days: a week after the 28th is 4 Mehr.
    expect(iso(expectedReturn(d('1405/06/28'), 7))).toBe(
      JalaliDate.parse('1405/07/04').toIsoDate(),
    );
  });

  it('reads a stored yyyy-MM-dd as a local day, not UTC midnight', () => {
    const sent = JalaliDate.parse('1405/07/01').toIsoDate();
    expect(iso(expectedReturn(sent, 21))).toBe(
      JalaliDate.parse('1405/07/22').toIsoDate(),
    );
  });
});

describe('timeliness', () => {
  it('is on time before the day, due on it, and overdue from the next', () => {
    expect(timeliness(d('1405/07/10'), now)).toEqual({
      state: 'on_time',
      daysLate: 0,
    });
    expect(timeliness(d('1405/07/09'), now)).toEqual({
      state: 'due_today',
      daysLate: 0,
    });
    expect(timeliness(d('1405/07/07'), now)).toEqual({
      state: 'overdue',
      daysLate: 2,
    });
  });

  it('ignores the time of day: late afternoon on the due day is still due', () => {
    const evening = new Date(2026, 9, 1, 19, 30);
    expect(timeliness(d('1405/07/09'), evening).state).toBe('due_today');
  });
});
