import { describe, expect, it, jest } from '@jest/globals';
import type { EntityManager } from 'typeorm';

import { refreshCaseCopies, surgerySearchText } from './case-copy';

const linked = (over: Record<string, unknown> = {}) => ({
  id: 'row-1',
  recordedName: 'مریم کریمی',
  toothPosition: '',
  teethFdi: [16],
  implantBrand: 'TRI',
  implantRegistryNo: '301',
  hasNameMismatch: false,
  searchText: surgerySearchText({
    implantRegistryNo: '301',
    recordedName: 'مریم کریمی',
    toothPosition: '',
    teethFdi: [16],
    implantBrand: 'TRI',
  }),
  caseRegistryNo: '301',
  caseName: 'مریم کریمی',
  ...over,
});

/** A manager whose SELECT answers `rows` and whose UPDATE is recorded. */
function managerWith(rows: unknown[]) {
  const query = jest.fn<(sql: string, params?: unknown[]) => Promise<unknown>>(
    (sql) => Promise.resolve(sql.trimStart().startsWith('SELECT') ? rows : []),
  );
  const manager = { query } as unknown as EntityManager;
  const update = () =>
    query.mock.calls.find(([sql]) => sql.trimStart().startsWith('UPDATE'));
  return { manager, query, update };
}

describe('refreshCaseCopies', () => {
  it('writes nothing when every row already agrees with its case', async () => {
    const { manager, update } = managerWith([linked()]);
    expect(await refreshCaseCopies(manager, ['case-1'])).toBe(0);
    expect(update()).toBeUndefined();
  });

  it('flags a row once its case is renamed to someone else, and clears it once renamed back', async () => {
    const renamed = managerWith([linked({ caseName: 'رضا احمدی' })]);
    expect(await refreshCaseCopies(renamed.manager, ['case-1'])).toBe(1);
    expect(renamed.update()?.[1]).toEqual([
      ['row-1'],
      ['301'],
      [true],
      [linked().searchText],
    ]);

    // Written with Arabic letters is still the same name.
    const back = managerWith([
      linked({ hasNameMismatch: true, caseName: 'مريم كريمي' }),
    ]);
    await refreshCaseCopies(back.manager, ['case-1']);
    expect(back.update()?.[1]?.[2]).toEqual([false]);
  });

  it('takes the case’s new number into the row and its search', async () => {
    const { manager, update } = managerWith([
      linked({ caseRegistryNo: '401' }),
    ]);
    await refreshCaseCopies(manager, ['case-1']);
    const [, no, , search] = update()?.[1] as unknown[][];
    expect(no).toEqual(['401']);
    expect(search[0]).toContain('401');
    expect(search[0]).not.toContain('301');
  });

  it('narrows to the cases named, or reads every linked row', async () => {
    const one = managerWith([]);
    await refreshCaseCopies(one.manager, ['case-1']);
    expect(one.query.mock.calls[0][1]).toEqual([['case-1']]);
    // Locked as read, so a surgery edit saving at the same moment is waited for.
    expect(one.query.mock.calls[0][0]).toContain('FOR UPDATE OF s');

    const every = managerWith([]);
    await refreshCaseCopies(every.manager);
    expect(every.query.mock.calls[0][0]).not.toContain('WHERE');
    expect(every.query.mock.calls[0][1]).toEqual([]);
  });
});
