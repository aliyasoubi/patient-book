import { describe, expect, it } from 'vitest';

import type { RegistryCase } from '../../core/models/common.model';
import { changedCaseFields } from './registry-case-dialog';

const kase = (over: Partial<RegistryCase> = {}): RegistryCase => ({
  id: 'case-1',
  registryNo: '1001',
  patientId: null,
  patient: null,
  recordedName: 'مریم کریمی',
  matchMethod: 'unmatched',
  mobile: null,
  homePhone: null,
  status: 'active',
  notes: null,
  version: 1,
  ...over,
});

describe('changedCaseFields', () => {
  it('names the visible fields someone else changed', () => {
    const after = kase({ recordedName: 'مریم کریمی‌نژاد', patientId: 'p-1', version: 2 });
    expect(changedCaseFields(kase(), after, false)).toEqual([
      'registryForm.recordedName',
      'registryForm.patientLink',
    ]);
  });

  it('leaves out fields the dialog does not show', () => {
    const after = kase({ notes: 'یادداشت', version: 2 });
    expect(changedCaseFields(kase(), after, false)).toEqual([]);
    expect(changedCaseFields(kase(), after, true)).toEqual(['registryForm.notes']);
  });
});
