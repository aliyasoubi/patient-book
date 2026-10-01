import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import type { SurgeryQueueItem } from '../../core/models/common.model';
import { adoptUntouched } from '../../shared/form-sync';
import { changedSurgeryFields, pickRegistryNo } from './surgery-form';

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

describe('pickRegistryNo', () => {
  const form = () =>
    new FormGroup({
      recordedName: new FormControl('مریم کریمی', { nonNullable: true }),
      implantRegistryNo: new FormControl('42', { nonNullable: true }),
    });

  it('keeps a picked number through conflict recovery, beside the name it came with', () => {
    const f = form();
    f.controls.recordedName.setValue('سارا احمدی');
    f.controls.recordedName.markAsDirty();
    pickRegistryNo(f.controls.implantRegistryNo, {
      value: 'سارا احمدی',
      label: 'سارا احمدی',
      meta: '77',
    });

    // Someone else saved the row meanwhile; untouched fields take their copy.
    adoptUntouched(f, { recordedName: 'مریم کریمی', implantRegistryNo: '42' });

    expect(f.getRawValue()).toEqual({ recordedName: 'سارا احمدی', implantRegistryNo: '77' });
  });

  it('leaves the number alone when the picked entry has none', () => {
    const f = form();
    pickRegistryNo(f.controls.implantRegistryNo, { value: 'x', label: 'x' });
    expect(f.controls.implantRegistryNo.value).toBe('42');
    expect(f.controls.implantRegistryNo.pristine).toBe(true);
  });
});
