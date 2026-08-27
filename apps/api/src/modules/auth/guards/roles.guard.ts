import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../domain';
import { ROLES_KEY } from '../../../presentation/http/decorators/roles.decorator';
import type { RequestUser } from '../strategies/jwt.strategy';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode } from '../../../domain';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (!user) throw AppException.forbidden(ErrorCode.Forbidden);
    if (!required.includes(user.role as UserRole)) {
      throw AppException.forbidden(ErrorCode.Forbidden, { required: required.join(', ') });
    }
    return true;
  }
}
