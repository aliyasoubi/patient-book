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
    createQueryBuilder: jest.fn(() => qb as unknown as SelectQueryBuilder<Patient>),
  } as unknown as Repository<Patient>;
  return { builder: new PatientQueryBuilder(patients), calls };
};

const query = (sortBy?: string): QueryPatientsDto =>
  ({ sortBy, sortDir: 'ASC', page: 1, limit: 25 }) as QueryPatientsDto;

describe('PatientQueryBuilder sorting', () => {
  it('sorts by an allow-listed column', () => {
    const { builder, calls } = stub();

    builder.build(query('fileNo'));

    expect(calls.get('orderBy')).toHaveBeenCalledWith('p.fileNo', 'ASC', 'NULLS LAST');
  });

  it('falls back to the default column when none is asked for', () => {
    const { builder, calls } = stub();

    builder.build(query());

    expect(calls.get('orderBy')).toHaveBeenCalledWith('p.lastName', 'ASC', 'NULLS LAST');
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
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'rejects the inherited property %s',
    (inherited) => {
      const { builder, calls } = stub();

      expect(() => builder.build(query(inherited))).toThrow(
        expect.objectContaining({ code: ErrorCode.SortFieldUnsupported }),
      );
      expect(calls.get('orderBy')).not.toHaveBeenCalled();
    },
  );
});
