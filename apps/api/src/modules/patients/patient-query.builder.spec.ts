import { describe, expect, it, jest } from '@jest/globals';
import type { Repository, SelectQueryBuilder } from 'typeorm';

import { PatientQueryBuilder } from './patient-query.builder';
import { Patient } from './patient.entity';
import type { QueryPatientsDto } from './dto/query-patients.dto';
import { ErrorCode } from '../../domain';

const CHAINED = [
  'leftJoinAndSelect',
  'andWhere',
  'addSelect',
  'setParameter',
  'orderBy',
  'addOrderBy',
  'withDeleted',
] as const;

/** Every builder call returns the same object, so the chain can be recorded. */
const stub = () => {
  const qb: Record<string, unknown> = {};
  const calls = new Map<string, jest.Mock>();
  for (const method of CHAINED) {
    const mock = jest.fn(() => qb);
    calls.set(method, mock as unknown as jest.Mock);
    qb[method] = mock;
  }
  const patients = {
    createQueryBuilder: jest.fn(
      () => qb as unknown as SelectQueryBuilder<Patient>,
    ),
  } as unknown as Repository<Patient>;
  return { builder: new PatientQueryBuilder(patients), calls };
};

const query = (
  sortBy?: string,
  sortDir: 'ASC' | 'DESC' = 'ASC',
): QueryPatientsDto =>
  ({ sortBy, sortDir, page: 1, limit: 25 }) as QueryPatientsDto;

describe('PatientQueryBuilder sorting', () => {
  it('sorts by an allow-listed column', () => {
    const { builder, calls } = stub();

    builder.build(query('lastName'));

    expect(calls.get('orderBy')).toHaveBeenCalledWith(
      'p.lastName',
      'ASC',
      'NULLS LAST',
    );
  });

  it('sorts fileNo numerically, not as text', () => {
    // A text sort puts "10" before "2"; the cast is what makes ASC/DESC both
    // read as an actual number order instead.
    const { builder, calls } = stub();

    builder.build(query('fileNo'));

    expect(calls.get('addSelect')).toHaveBeenCalledWith(
      expect.stringContaining('::bigint'),
      'file_num',
    );
    expect(calls.get('orderBy')).toHaveBeenCalledWith(
      'file_num',
      'ASC',
      'NULLS LAST',
    );
  });

  it('sorts fileNo descending on the same numeric key', () => {
    const { builder, calls } = stub();

    builder.build(query('fileNo', 'DESC'));

    expect(calls.get('orderBy')).toHaveBeenCalledWith(
      'file_num',
      'DESC',
      'NULLS LAST',
    );
  });

  it('falls back to the default column when none is asked for', () => {
    const { builder, calls } = stub();

    builder.build(query());

    expect(calls.get('orderBy')).toHaveBeenCalledWith(
      'p.lastName',
      'ASC',
      'NULLS LAST',
    );
  });

  it('rejects a column that is not on the allow-list', () => {
    const { builder } = stub();

    expect(() => builder.build(query('passwordHash'))).toThrow(
      expect.objectContaining({ code: ErrorCode.SortFieldUnsupported }),
    );
  });

  /**
   * `SORTABLE.constructor` resolves through the prototype chain to a function,
   * which a truthiness check accepts and TypeORM would splice into ORDER BY.
   */
  it.each([
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
  ])('rejects the inherited property %s', (inherited) => {
    const { builder, calls } = stub();

    expect(() => builder.build(query(inherited))).toThrow(
      expect.objectContaining({ code: ErrorCode.SortFieldUnsupported }),
    );
    expect(calls.get('orderBy')).not.toHaveBeenCalled();
  });
});

describe('PatientQueryBuilder search', () => {
  const search = (q: string): QueryPatientsDto =>
    ({ q, sortDir: 'ASC', page: 1, limit: 25 }) as QueryPatientsDto;

  it('ranks by how well the name matches before the rest of the record', () => {
    // `searchText` also holds addresses and occupation; ranking on it alone
    // put محمدرضا مرادی 14th of 17 for "مرادی" because of a long address.
    const { builder, calls } = stub();

    builder.build(search('محمد مرادی'));

    const order = [
      ...calls.get('orderBy')!.mock.calls,
      ...calls.get('addOrderBy')!.mock.calls,
    ].map(([column]) => column);
    expect(order).toEqual([
      'exact_file',
      'name_hits',
      'name_sim',
      'sim',
      'p.lastName',
    ]);
  });

  it('counts each query word that begins a word of the name', () => {
    const { builder, calls } = stub();

    builder.build(search('محمد مرادی'));

    expect(calls.get('addSelect')).toHaveBeenCalledWith(
      `(((' ' || p."nameKey") LIKE :n0)::int + ((' ' || p."nameKey") LIKE :n1)::int)`,
      'name_hits',
    );
    expect(calls.get('setParameter')).toHaveBeenCalledWith('n0', '% محمد%');
    expect(calls.get('setParameter')).toHaveBeenCalledWith('n1', '% مرادی%');
  });

  it('folds the query before matching, as the column was folded', () => {
    const { builder, calls } = stub();

    builder.build(search('علي'));

    expect(calls.get('setParameter')).toHaveBeenCalledWith('simKey', 'علی');
  });

  it('does not rank a blank query by relevance', () => {
    const { builder, calls } = stub();

    builder.build(search('   '));

    expect(calls.get('orderBy')).toHaveBeenCalledWith(
      'p.lastName',
      'ASC',
      'NULLS LAST',
    );
  });
});
