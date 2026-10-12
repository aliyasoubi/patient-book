import { describe, expect, it } from '@jest/globals';

import { followUpState, followUpWindow, settledStatusOf } from './follow-up';
import { FollowUpStatus, JalaliDate, SurgeryStatus } from '../../domain';

// "Now" is 27 Shahrivar 1405 (18 September 2026) for every case here.
const now = new Date(2026, 8, 18);
const j = (jalaliDate: string): string =>
  JalaliDate.parse(jalaliDate).toIsoDate();

describe('followUpWindow', () => {
  it('names the current and next Jalali month, whole', () => {
    expect(followUpWindow('thisMonth', now)).toEqual({
      from: j('1405/06/01'),
      to: j('1405/06/31'),
    });
    expect(followUpWindow('nextMonth', now)).toEqual({
      from: j('1405/07/01'),
      to: j('1405/07/30'),
    });
  });

  it('is the seven days from today for the week — not the calendar week', () => {
    expect(followUpWindow('week', now)).toEqual({
      from: j('1405/06/27'),
      to: j('1405/07/02'),
    });
  });

  it('counts a follow-up overdue only once its month has passed', () => {
    expect(followUpWindow('overdue', now)).toEqual({ to: j('1405/05/31') });
  });

  it('puts no bounds on pending: every open follow-up, whatever its date', () => {
    expect(followUpWindow('pending', now)).toEqual({});
  });
});

describe('settledStatusOf', () => {
  it('names the status a settled-follow-up filter lists, and nothing for the open windows', () => {
    expect(settledStatusOf('booked')).toBe(FollowUpStatus.Booked);
    expect(settledStatusOf('declined')).toBe(FollowUpStatus.Declined);
    expect(settledStatusOf('overdue')).toBeNull();
    expect(followUpWindow('booked', now)).toEqual({});
  });
});

describe('followUpState', () => {
  const at = (jalaliDate: string) => ({
    followUpDate: JalaliDate.parse(jalaliDate).date,
    followUpStatus: FollowUpStatus.Open,
  });

  it('judges due, overdue and pending against the current Jalali month', () => {
    expect(followUpState(at('1405/06/01'), now)).toBe('due');
    expect(followUpState(at('1405/06/31'), now)).toBe('due');
    expect(followUpState(at('1405/05/31'), now)).toBe('overdue');
    expect(followUpState(at('1405/07/01'), now)).toBe('pending');
  });

  it('is booked or declined once the patient has said, whatever the calendar says', () => {
    expect(
      followUpState(
        { ...at('1405/05/01'), followUpStatus: FollowUpStatus.Booked },
        now,
      ),
    ).toBe('booked');
    expect(
      followUpState(
        { ...at('1405/05/01'), followUpStatus: FollowUpStatus.Declined },
        now,
      ),
    ).toBe('declined');
  });

  it('is none without a follow-up date', () => {
    expect(
      followUpState(
        { followUpDate: null, followUpStatus: FollowUpStatus.Open },
        now,
      ),
    ).toBe('none');
  });

  it('is none for a cancelled surgery, however late its date', () => {
    expect(
      followUpState(
        { ...at('1405/05/01'), status: SurgeryStatus.Cancelled },
        now,
      ),
    ).toBe('none');
  });
});
