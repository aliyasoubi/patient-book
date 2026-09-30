import { describe, expect, it, jest } from '@jest/globals';
import type { EntityManager, Repository } from 'typeorm';

import { AuditService } from './audit.service';
import { AuditLog } from '../../infrastructure/persistence/entities/audit-log.entity';

describe('AuditService', () => {
  it('uses the caller transaction and propagates required audit writes', async () => {
    const create = jest.fn((input: Partial<AuditLog>) =>
      Object.assign(new AuditLog(), input),
    );
    const save = jest.fn((row: AuditLog) => Promise.resolve(row));
    const getRepository = jest.fn((entity: unknown) => {
      if (entity !== AuditLog) throw new Error('Unexpected repository target');
      return { create, save };
    });
    const service = new AuditService({} as Repository<AuditLog>);

    await service.recordRequired(
      {
        userId: 'user-1',
        action: 'update',
        entity: 'patient',
        entityId: 'patient-1',
        changes: { notes: { from: null, to: 'checked' } },
      },
      { getRepository } as unknown as EntityManager,
    );

    expect(getRepository).toHaveBeenCalledWith(AuditLog);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'update',
        entityId: 'patient-1',
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('names the user behind history rows that recorded only an id', async () => {
    const rows = [
      Object.assign(new AuditLog(), { userId: 'u-1', username: null }),
      Object.assign(new AuditLog(), { userId: 'u-2', username: 'kept' }),
      Object.assign(new AuditLog(), { userId: null, username: null }),
    ];
    const query = jest
      .fn<(sql: string, params: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([{ id: 'u-1', username: 'reception' }]);
    const service = new AuditService({
      find: jest.fn(() => Promise.resolve(rows)),
      query,
    } as unknown as Repository<AuditLog>);

    const history = await service.forEntity('patient', 'patient-1');

    expect(query).toHaveBeenCalledWith(expect.any(String), [['u-1']]);
    expect(history.map((r) => r.username)).toEqual(['reception', 'kept', null]);
  });
});
