import { describe, expect, it, jest } from '@jest/globals';
import type { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorCode } from '../../../domain';
import type { ErrorResponse } from '../error-response';

/** Runs the filter against a bare request/response pair and returns the body. */
function run(exception: unknown): { status: number; body: ErrorResponse } {
  const json = jest.fn<(body: ErrorResponse) => void>();
  const status = jest.fn<(code: number) => { json: typeof json }>(() => ({
    json,
  }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/patients' }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

/** What node-postgres raises when an index rejects a duplicate. */
function uniqueViolation(constraint: string): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint,
    detail: 'Key ("fileNo")=(10404) already exists.',
  });
  return new QueryFailedError('INSERT INTO patients …', [], driverError);
}

describe('AllExceptionsFilter database errors', () => {
  it('reports a duplicate file number by its own code when the index catches it', () => {
    // Two creates racing past the service-level check both reach the index;
    // the loser must get the same answer it would have got from the check.
    const { status, body } = run(uniqueViolation('idx_patients_fileno'));

    expect(status).toBe(409);
    expect(body.code).toBe(ErrorCode.FileNumberTaken);
  });

  it('maps both register indexes to the registry-number code', () => {
    expect(run(uniqueViolation('idx_implant_registry')).body.code).toBe(
      ErrorCode.RegistryNumberTaken,
    );
    expect(run(uniqueViolation('idx_ortho_registry')).body.code).toBe(
      ErrorCode.RegistryNumberTaken,
    );
  });

  it('falls back to a generic conflict for an index it does not know', () => {
    const { status, body } = run(uniqueViolation('some_other_index'));

    expect(status).toBe(409);
    expect(body.code).toBe(ErrorCode.ValidationFailed);
  });

  it('leaks nothing from the driver into the response body', () => {
    const { body } = run(uniqueViolation('idx_patients_fileno'));

    expect(JSON.stringify(body)).not.toContain('10404');
    expect(JSON.stringify(body)).not.toContain('idx_patients_fileno');
  });
});
