import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';

import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { BCRYPT_COST, type User } from '../users/user.entity';
import type {
  AuditEntry,
  AuditService,
} from '../../application/services/audit.service';
import { ErrorCode } from '../../domain';

const makeService = (options: {
  payload?: { sub: string; username: string; role: string; tv: number };
  verifyError?: Error;
  user?: Partial<User> | null;
}) => {
  const findOne = jest.fn(() => Promise.resolve(options.user ?? null));
  const increment = jest.fn<
    (
      criteria: { id: string },
      propertyPath: string,
      value: number,
    ) => Promise<void>
  >(() => Promise.resolve());
  const verifyAsync = options.verifyError
    ? jest.fn(() => Promise.reject(new Error(options.verifyError?.message)))
    : jest.fn(() => Promise.resolve(options.payload!));

  const service = new AuthService(
    { findOne, increment } as unknown as Repository<User>,
    { verifyAsync } as unknown as JwtService,
    {
      get: jest.fn(() => ({ refreshSecret: 'test-refresh-secret' })),
    } as unknown as ConfigService,
    {} as AuditService,
  );

  return { service, findOne, increment };
};

describe('AuthService logout', () => {
  it('revokes the token family represented by a valid refresh cookie', async () => {
    const { service, increment } = makeService({
      payload: { sub: 'user-1', username: 'admin', role: 'admin', tv: 4 },
      user: { id: 'user-1', isActive: true, tokenVersion: 4 },
    });

    await service.logout('valid-refresh-token');

    expect(increment).toHaveBeenCalledWith({ id: 'user-1' }, 'tokenVersion', 1);
  });

  it('is idempotent when the refresh cookie is expired or invalid', async () => {
    const { service, findOne, increment } = makeService({
      verifyError: new Error('expired'),
    });

    await expect(
      service.logout('expired-refresh-token'),
    ).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it('does not let an already-revoked cookie revoke a newer session', async () => {
    const { service, increment } = makeService({
      payload: { sub: 'user-1', username: 'admin', role: 'admin', tv: 3 },
      user: { id: 'user-1', isActive: true, tokenVersion: 4 },
    });

    await service.logout('old-refresh-token');

    expect(increment).not.toHaveBeenCalled();
  });
});

describe('AuthService login', () => {
  const makeLoginService = (user: Partial<User> | null) => {
    const getOne = jest.fn(() => Promise.resolve(user));
    const qb = {
      addSelect: () => qb,
      where: () => qb,
      getOne,
    };
    const record = jest.fn<(entry: AuditEntry) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const service = new AuthService(
      { createQueryBuilder: () => qb } as unknown as Repository<User>,
      {} as JwtService,
      {} as ConfigService,
      { record } as unknown as AuditService,
    );
    return { service, record };
  };

  it('spends as long on an unknown username as on a wrong password', async () => {
    // A malformed dummy hash is rejected by bcrypt in microseconds while a
    // real comparison takes ~200 ms, which would reveal through timing
    // exactly the username existence the constant message hides. Both paths
    // are CPU-bound in this process, so the ratio holds on a loaded CI box.
    const realHash = await bcrypt.hash('correct horse', BCRYPT_COST);
    const started = process.hrtime.bigint();
    await bcrypt.compare('wrong', realHash);
    const realCompareMs = Number(process.hrtime.bigint() - started) / 1e6;

    const { service, record } = makeLoginService(null);
    const loginStarted = process.hrtime.bigint();
    await expect(service.login('nobody', 'whatever')).rejects.toMatchObject({
      code: ErrorCode.InvalidCredentials,
    });
    const unknownUserMs = Number(process.hrtime.bigint() - loginStarted) / 1e6;

    expect(unknownUserMs).toBeGreaterThan(realCompareMs * 0.5);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login_failed', userId: null }),
    );
  });
});
