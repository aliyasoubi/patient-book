import { describe, expect, it, jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ready only after PostgreSQL answers', async () => {
    const query = jest.fn<(sql: string) => Promise<unknown[]>>(() =>
      Promise.resolve([{ '?column?': 1 }]),
    );
    const controller = new HealthController({ query } as unknown as DataSource);

    const result = await controller.check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result.status).toBe('ok');
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });

  it('reports unavailable when PostgreSQL cannot answer', async () => {
    const query = jest.fn<(sql: string) => Promise<unknown[]>>(() =>
      Promise.reject(new Error('database down')),
    );
    const controller = new HealthController({ query } as unknown as DataSource);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
