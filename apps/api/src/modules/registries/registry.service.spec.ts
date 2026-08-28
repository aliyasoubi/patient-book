import { describe, expect, it, jest } from '@jest/globals';
import type { DeleteResult, EntityManager, Repository } from 'typeorm';

import { RegistryService, type RegistryCase } from './registry.service';
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
