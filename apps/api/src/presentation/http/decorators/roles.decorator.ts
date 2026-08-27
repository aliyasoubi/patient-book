import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../domain';

export const ROLES_KEY = 'roles';

/** Restrict an endpoint to the listed roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
