import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

import type { RequestUser } from '../../modules/auth/strategies/jwt.strategy';

/** Read by the web app to notice that a newer release is now serving. */
export const APP_VERSION_HEADER = 'X-App-Version';

/**
 * Tells a signed-in client which release answered it. A tab opened before a
 * deploy keeps running the old bundle, which may no longer match this API;
 * the web app compares this header with its own version and offers a reload.
 *
 * Only on requests the auth guard let through with a user: the login page and
 * the health check stay silent, as Caddy keeps the server's own version out
 * of every response.
 */
@Injectable()
export class AppVersionInterceptor implements NestInterceptor {
  private readonly version: string;

  constructor(config: ConfigService) {
    this.version = config.get<string>('version')!;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    if (http.getRequest<Request & { user?: RequestUser }>().user) {
      http.getResponse<Response>().setHeader(APP_VERSION_HEADER, this.version);
    }
    return next.handle();
  }
}
