import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EnvAdminCredentials } from './infrastructure/env-admin-credentials';

/**
 * Protects admin routes with a single shared key sent as
 * `Authorization: Bearer <ADMIN_API_KEY>`. When `ADMIN_USERNAME` is set
 * (non-blank), the header `X-Admin-Username` must equal it as well. Both
 * variables are read on every request and the guard fails closed: with no
 * key configured nothing passes. Both checks always run and every failure
 * gives the same 401, so neither the message nor the timing reveals which
 * one failed.
 *
 * The rule itself lives in `domain/`; this is the HTTP edge that reads the
 * request and the environment.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly credentials = new EnvAdminCredentials();

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
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
    if (!valid) {
      throw new UnauthorizedException('Invalid or missing admin key');
    }
    return true;
  }
}
