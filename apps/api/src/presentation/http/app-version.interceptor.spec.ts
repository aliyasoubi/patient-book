import { describe, expect, it, jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

import {
  APP_VERSION_HEADER,
  AppVersionInterceptor,
} from './app-version.interceptor';

function run(user: object | undefined): jest.Mock {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  const config = { get: () => 'v1.4.0' } as unknown as ConfigService;
  const next: CallHandler = { handle: () => of(null) };

  new AppVersionInterceptor(config).intercept(context, next);
  return setHeader;
}

describe('AppVersionInterceptor', () => {
  it('names the release on a signed-in request', () => {
    expect(run({ id: 'u1' })).toHaveBeenCalledWith(
      APP_VERSION_HEADER,
      'v1.4.0',
    );
  });

  it('says nothing to a request without a user', () => {
    expect(run(undefined)).not.toHaveBeenCalled();
  });
});
