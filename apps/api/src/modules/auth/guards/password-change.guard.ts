import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestUser } from '../strategies/jwt.strategy';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode } from '../../../domain';
import { IS_PUBLIC_KEY } from '../../../presentation/http/decorators/public.decorator';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../../../presentation/http/decorators/allow-password-change-pending.decorator';

/** Keep a seeded/default-password account away from patient data. */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        targets,
      )
    ) {
      return true;
    }

    const user = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser }>().user;
    if (user?.mustChangePassword) {
      throw AppException.forbidden(ErrorCode.PasswordChangeRequired);
    }
    return true;
  }
}
