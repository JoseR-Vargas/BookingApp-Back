import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../../domain/admin-user';

export const ROLES_KEY = 'admin:roles';

/**
 * The roles that may call a route (or every route of a controller). A route
 * without it is read-only for every role and owner-only otherwise, so a new
 * mutating route is closed by default. The legacy admin key counts as owner.
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const ALL_ROLES: readonly AdminRole[] = ['owner', 'staff', 'viewer'];

/** The roles allowed on a route: the route's own, the controller's, or the default for the method. */
export function allowedRoles(
  handler: object | undefined,
  controller: object | undefined,
  method: string,
): readonly AdminRole[] {
  const own =
    (handler && (Reflect.getMetadata(ROLES_KEY, handler) as AdminRole[])) ||
    (controller &&
      (Reflect.getMetadata(ROLES_KEY, controller) as AdminRole[])) ||
    undefined;
  if (own) return own;
  return READ_METHODS.has(method.toUpperCase()) ? ALL_ROLES : ['owner'];
}
