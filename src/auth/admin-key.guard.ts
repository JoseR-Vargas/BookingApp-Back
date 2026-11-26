import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { currentScope } from '../shared/infrastructure/tenancy/tenant-scope.storage';
import { AuthenticateAdminSessionUseCase } from './application/use-cases/authenticate-admin-session.use-case';
import { ADMIN_MESSAGES } from './domain/admin-user.errors';
import { AdminRequest } from './infrastructure/http/admin-actor';
import { EnvAdminCredentials } from './infrastructure/env-admin-credentials';
import { allowedRoles } from './infrastructure/http/roles.decorator';
import { readSessionToken } from './infrastructure/http/session-cookie';

/**
 * Protects admin routes. Two ways in:
 *
 * 1. The shared key sent as `Authorization: Bearer <ADMIN_API_KEY>` (plus
 *    `X-Admin-Username` when `ADMIN_USERNAME` is set). Spec 17 behavior,
 *    unchanged; the key counts as an owner. It is read on every request and the
 *    guard fails closed: with no key configured it never opens. It can be
 *    turned off per business with `ADMIN_KEY_DISABLED_TENANTS` (slugs).
 * 2. The session cookie of an account (spec 20). The route's roles (`@Roles`,
 *    or the default of its method) must include the account's role, else 403.
 *
 * The key is checked first and synchronously, so the key path behaves exactly
 * as before. Every authentication failure gives the same 401, so neither the
 * message nor the timing reveals which check failed.
 *
 * The rule itself lives in `domain/`; this is the HTTP edge that reads the
 * request and the environment.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly credentials = new EnvAdminCredentials();

  constructor(
    @Optional()
    private readonly authenticateSession?: AuthenticateAdminSessionUseCase,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const { headers } = request;
    const header = headers.authorization;
    const providedKey =
      typeof header === 'string'
        ? /^Bearer\s+(\S+)$/i.exec(header)?.[1]
        : undefined;
    const usernameHeader = headers['x-admin-username'];

    const valid = this.credentials.isValid(
      providedKey,
      typeof usernameHeader === 'string' ? usernameHeader : undefined,
    );
    if (valid && !isKeyDisabledForBusiness()) {
      request.adminActor = { kind: 'key' };
      return true;
    }

    const token = readSessionToken(headers.cookie);
    if (token && this.authenticateSession) {
      return this.enter(context, request, token);
    }
    throw unauthorized();
  }

  private async enter(
    context: ExecutionContext,
    request: AdminRequest,
    token: string,
  ): Promise<boolean> {
    const result = await this.authenticateSession!.execute(token);
    if (!result.ok) throw unauthorized();
    const roles = allowedRoles(
      context.getHandler(),
      context.getClass(),
      request.method ?? 'GET',
    );
    if (!roles.includes(result.value.role)) {
      throw new ForbiddenException(ADMIN_MESSAGES.forbiddenRole);
    }
    request.adminActor = { kind: 'session', user: result.value };
    return true;
  }
}

const unauthorized = () =>
  new UnauthorizedException('Invalid or missing admin key');

/** Whether `ADMIN_KEY_DISABLED_TENANTS` lists the business of the request. */
function isKeyDisabledForBusiness(): boolean {
  const slug = currentScope()?.slug;
  const list = process.env.ADMIN_KEY_DISABLED_TENANTS;
  if (!slug || !list) return false;
  return list
    .split(',')
    .map((entry) => entry.trim())
    .includes(slug);
}
