import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../../../modules/auth/strategies/jwt.strategy';

/** Inject the authenticated user into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<{ user: RequestUser }>().user;
    return data ? user?.[data] : user;
  },
);
