import { describe, expect, it, jest } from '@jest/globals';
import type { Repository, SelectQueryBuilder } from 'typeorm';

import {
  exactIdentifier,
  identifierQuery,
  PatientQueryBuilder,
} from './patient-query.builder';
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
      'exact_id',
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

describe('identifierQuery', () => {
  it('reads a mobile written with its country code as the stored form', () => {
    // «98912…» is not part of «0912…», so the digits alone could never match.
    for (const typed of [
      '+98 912 123 4567',
      '0098-912-123-4567',
      '۹۸۹۱۲۱۲۳۴۵۶۷',
    ]) {
      expect(identifierQuery(typed)).toEqual({
        key: '09121234567',
        nationalId: null,
        mobile: '09121234567',
      });
    }
  });

  it('searches the bare digits otherwise, so punctuation does not split a number', () => {
    expect(identifierQuery('0912 123 4567')?.key).toBe('09121234567');
    expect(identifierQuery('007-898-0501')).toEqual({
      key: '0078980501',
      nationalId: '0078980501',
      mobile: null,
    });
  });

  it('keeps a ten-digit number open to being a national id or a mobile', () => {
    // 9121234567 is a national id as typed, and inside the mobile 09121234567.
    expect(identifierQuery('9121234567')).toEqual({
      key: '9121234567',
      nationalId: '9121234567',
      mobile: '09121234567',
    });
  });

  it('leaves anything with letters to the name search', () => {
    expect(identifierQuery('مرادی 12')).toBeNull();
    expect(identifierQuery('   ')).toBeNull();
  });
});

describe('exactIdentifier', () => {
  const p = { fileNo: '1234', nationalId: '0078980501', mobile: '09121234567' };

  it('names the identifier a whole number matched', () => {
    expect(exactIdentifier(identifierQuery('۱۲۳۴'), p)).toBe('fileNo');
    expect(exactIdentifier(identifierQuery('007-898-0501'), p)).toBe(
      'nationalId',
    );
    expect(exactIdentifier(identifierQuery('+98 912 123 4567'), p)).toBe(
      'mobile',
    );
  });

  it('is null for a fragment or a name', () => {
    expect(exactIdentifier(identifierQuery('123'), p)).toBeNull();
    expect(exactIdentifier(identifierQuery('مرادی'), p)).toBeNull();
  });
});

describe('PatientQueryBuilder identifier search', () => {
  const search = (q: string): QueryPatientsDto =>
    ({ q, sortDir: 'ASC', page: 1, limit: 25 }) as QueryPatientsDto;

  it('ranks an exact national id or mobile first, never a missing one', () => {
    const { builder, calls } = stub();

    builder.build(search('9121234567'));

    expect(calls.get('addSelect')).toHaveBeenCalledWith(
      `coalesce(p."fileNo" = :simKey OR p."nationalId" = :exactNid OR p."mobile" = :exactMobile, false)`,
      'exact_id',
    );
    expect(calls.get('setParameter')).toHaveBeenCalledWith(
      'exactNid',
      '9121234567',
    );
    expect(calls.get('setParameter')).toHaveBeenCalledWith(
      'exactMobile',
      '09121234567',
    );
  });
});
