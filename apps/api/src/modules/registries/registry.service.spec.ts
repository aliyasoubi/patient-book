import { describe, expect, it, jest } from '@jest/globals';
import type {
  DeleteResult,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { RegistryService, type RegistryCase } from './registry.service';
import type { QueryRegistryDto } from './registry.dto';
import type {
  AuditEntry,
  AuditService,
} from '../../application/services/audit.service';

class TestRegistryCase implements RegistryCase {
  id = 'case-1';
  registryNo = '1001';
  patientId = null;
  recordedName = 'مریم کریمی';
  matchMethod = 'unmatched' as const;
  mobile = null;
  homePhone = null;
  notes = null;
  searchText = '1001 مریم کریمی';
}

describe('RegistryService', () => {
  it('archives a row and its required audit entry in one transaction', async () => {
    const row = new TestRegistryCase();
    const findOne = jest.fn(() => Promise.resolve(row));
    const softDelete = jest.fn<(id: string) => Promise<DeleteResult>>(() =>
      Promise.resolve({ raw: [], affected: 1 }),
    );
    const repository = {
      findOne,
      softDelete,
    } as unknown as Repository<TestRegistryCase>;
    const getRepository = jest.fn(() => repository);
    const manager = { getRepository } as unknown as EntityManager;
    const transaction = jest.fn(
      (operation: (transactionManager: EntityManager) => Promise<void>) =>
        operation(manager),
    );
    const recordRequired = jest.fn<
      (entry: AuditEntry, transactionManager?: EntityManager) => Promise<void>
    >(() => Promise.resolve());
    const audit = { recordRequired } as unknown as AuditService;
    const rootRepository = {
      target: TestRegistryCase,
      manager: { transaction },
    } as unknown as Repository<TestRegistryCase>;
    const service = new RegistryService(rootRepository, 'implant_case', audit);

    await service.remove(row.id, 'user-1');

    expect(softDelete).toHaveBeenCalledWith(row.id);
    expect(recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entity: 'implant_case',
        entityId: row.id,
      }),
      manager,
    );
  });
});

const CHAINED = [
  'leftJoinAndSelect',
  'skip',
  'take',
  'andWhere',
  'addSelect',
  'orderBy',
  'addOrderBy',
  'withDeleted',
] as const;

/** Chainable builder stub that resolves to an empty page. */
const listStub = () => {
  const qb: Record<string, unknown> = {
    getManyAndCount: jest.fn(() => Promise.resolve([[], 0])),
  };
  const calls = new Map<string, jest.Mock>();
  for (const method of CHAINED) {
    const mock = jest.fn(() => qb);
    calls.set(method, mock as unknown as jest.Mock);
    qb[method] = mock;
  }
  const repository = {
    createQueryBuilder: jest.fn(
      () => qb as unknown as SelectQueryBuilder<TestRegistryCase>,
    ),
  } as unknown as Repository<TestRegistryCase>;
  const service = new RegistryService(
    repository,
    'implant_case',
    {} as AuditService,
  );
  return { service, calls };
};

const query = (sortBy?: string): QueryRegistryDto =>
  ({ sortBy, sortDir: 'ASC', page: 1, limit: 25 }) as QueryRegistryDto;

describe('RegistryService sorting', () => {
  it('sorts by an allow-listed column', async () => {
    const { service, calls } = listStub();

    await service.findAll(query('recordedName'));

    expect(calls.get('orderBy')).toHaveBeenCalledWith('c.recordedName', 'ASC');
  });

  /**
   * `sortable.constructor` resolves through the prototype chain to a function,
   * which the `??` fallback keeps and TypeORM would splice into ORDER BY.
   */
  it.each(['constructor', 'toString', 'valueOf', '__proto__'])(
    'falls back to the default register order for the inherited property %s',
    async (inherited) => {
      const { service, calls } = listStub();

      await service.findAll(query(inherited));

      // The numeric-register branch, exactly as an unset `sortBy` takes.
      expect(calls.get('orderBy')).toHaveBeenCalledWith('registry_num', 'ASC');
    },
  );
});
