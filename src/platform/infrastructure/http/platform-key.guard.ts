// ===== GUARD DE PLATAFORMA =====
// The routes of the owner of the system (`/api/platform/*`) are opened with
// their own key, `PLATFORM_API_KEY` (spec 25). It is NOT the admin key of a
// business: the admin key does not open these routes and the platform key
// does not open the routes of a business.
//
// The guard fails closed: without a configured key it never opens, and every
// failure answers the same 401.

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PLATFORM_CREDENTIALS,
  PlatformCredentials,
} from '../../application/ports/platform-credentials.port';

/** The header that carries the key of the owner of the system. */
export const PLATFORM_KEY_HEADER = 'x-platform-key';

/** The answer of every failure: it never says why it failed. */
export const PLATFORM_UNAUTHORIZED_MESSAGE =
  'Clave de plataforma inválida o ausente.';

/** The key the request carries, or undefined when it carries none. */
export function readPlatformKey(
  headers: Record<string, unknown>,
): string | undefined {
  const header = headers[PLATFORM_KEY_HEADER];
  if (typeof header === 'string' && header.trim() !== '') return header;
  if (Array.isArray(header)) {
    const values = header as unknown[];
    const first = values.find(
      (value): value is string =>
        typeof value === 'string' && value.trim() !== '',
    );
    if (first !== undefined) return first;
  }
  const authorization = headers.authorization;
  if (typeof authorization === 'string') {
    return /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  }
  return undefined;
}

@Injectable()
export class PlatformKeyGuard implements CanActivate {
  constructor(
    @Inject(PLATFORM_CREDENTIALS)
    private readonly credentials: PlatformCredentials,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
    }>();
    const provided = readPlatformKey(request.headers ?? {});
    if (!this.credentials.isValid(provided)) {
      throw new UnauthorizedException(PLATFORM_UNAUTHORIZED_MESSAGE);
    }
    return true;
  }
}
