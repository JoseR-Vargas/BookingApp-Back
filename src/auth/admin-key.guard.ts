import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

const BEARER = /^Bearer\s+(\S+)$/i;

/** Fixed-length digests make the comparison independent of the key length. */
const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/**
 * Protects admin routes with a single shared key sent as
 * `Authorization: Bearer <ADMIN_API_KEY>`. The variable is read on every
 * request and the guard fails closed: with no key configured nothing passes.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = headers.authorization;
    const provided =
      typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;

    if (
      !expected ||
      expected.trim() === '' ||
      provided === undefined ||
      !timingSafeEqual(digest(provided), digest(expected))
    ) {
      throw new UnauthorizedException('Invalid or missing admin key');
    }
    return true;
  }
}
