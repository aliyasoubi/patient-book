import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

import { DataExchangeController } from './data-exchange.controller';
import type {
  AuditEntry,
  AuditService,
} from '../../application/services/audit.service';
import type { ExportWorkbookUseCase } from './application/export-workbook.use-case';
import type { ReconcileWorkbookUseCase } from './application/reconcile-workbook.use-case';
import type { ApplyReconcileUseCase } from './application/apply-reconcile.use-case';

describe('DataExchangeController export', () => {
  const makeController = (auditError?: Error) => {
    const recordRequired = jest.fn<(entry: AuditEntry) => Promise<void>>(() =>
      auditError ? Promise.reject(auditError) : Promise.resolve(),
    );
    const controller = new DataExchangeController(
      {
        execute: () =>
          Promise.resolve({ buffer: Buffer.from('xlsx'), counts: { patients: 3 } }),
      } as unknown as ExportWorkbookUseCase,
      {} as ReconcileWorkbookUseCase,
      {} as ApplyReconcileUseCase,
      { recordRequired } as unknown as AuditService,
    );
    const res = { set: jest.fn(), send: jest.fn() };
    const req = { ip: '127.0.0.1' } as Request;
    const user = { id: 'admin-1', username: 'admin' };
    return { controller, recordRequired, res, req, user };
  };

  it('records the export before sending the workbook', async () => {
    const { controller, recordRequired, res, req, user } = makeController();

    await controller.export(res as unknown as Response, req, user);

    expect(recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'export',
        entity: 'patient_book',
        userId: 'admin-1',
        changes: { patients: 3 },
      }),
    );
    expect(res.send).toHaveBeenCalledTimes(1);
  });

  it('does not send the workbook when the audit write fails', async () => {
    // A whole-register PII extract with no audit row is exactly the event the
    // audit trail exists to catch, so the download must not outrun it.
    const { controller, res, req, user } = makeController(new Error('db down'));

    await expect(
      controller.export(res as unknown as Response, req, user),
    ).rejects.toThrow('db down');

    expect(res.send).not.toHaveBeenCalled();
  });
});
