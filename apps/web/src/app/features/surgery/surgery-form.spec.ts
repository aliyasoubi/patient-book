import { describe, expect, it } from 'vitest';

import type { SurgeryQueueItem } from '../../core/models/common.model';
import { changedSurgeryFields } from './surgery-form';

const row = (over: Partial<SurgeryQueueItem> = {}): SurgeryQueueItem => ({
  id: 'row-1',
  kind: 'implant',
  implantCaseId: null,
  implantRegistryNo: '1001',
  recordedName: 'مریم کریمی',
  hasNameMismatch: false,
  registeredName: null,
  patient: null,
  surgeryDate: { jalali: '1405/04/01', iso: '2026-06-22', precision: 'day' },
  toothPosition: '۶ بالا',
  implantBrand: null,
  abutmentType: 'unknown',
  abutmentRaw: null,
  prosthesisDue: null,
  followUpMonths: 3,
  followUpDate: { jalali: '1405/07/01', iso: '2026-09-23' },
  followUpDoneAt: null,
  followUpState: 'due',
  status: 'completed',
  notes: null,
  version: 1,
  ...over,
});

describe('changedSurgeryFields', () => {
  it('names only the fields someone else changed', () => {
    const after = row({ toothPosition: '۷ پایین', notes: 'درد', version: 2 });
    expect(changedSurgeryFields(row(), after)).toEqual([
      'surgeryForm.toothPosition',
      'surgeryForm.notes',
    ]);
  });

  it('counts the follow-up switch as a change to the follow-up', () => {
    const after = row({ followUpDoneAt: '1405/07/05', followUpState: 'done', version: 2 });
    expect(changedSurgeryFields(row(), after)).toEqual(['surgeryForm.followUp']);
  });

  it('names nothing when only the version moved', () => {
    expect(changedSurgeryFields(row(), row({ version: 2 }))).toEqual([]);
  });
});
