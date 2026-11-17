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

/** True when `provided` is a string equal to `expected` (constant time). */
const matches = (provided: string | undefined, expected: string): boolean =>
  provided !== undefined && timingSafeEqual(digest(provided), digest(expected));

/**
 * Protects admin routes with a single shared key sent as
 * `Authorization: Bearer <ADMIN_API_KEY>`. When `ADMIN_USERNAME` is set
 * (non-blank), the header `X-Admin-Username` must equal it as well. Both
 * variables are read on every request and the guard fails closed: with no
 * key configured nothing passes. Both checks always run and every failure
 * gives the same 401, so neither the message nor the timing reveals which
 * one failed.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    const username = process.env.ADMIN_USERNAME;
    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = headers.authorization;
    const provided =
      typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    const usernameHeader = headers['x-admin-username'];

    const keyOk =
      !!expected && expected.trim() !== '' && matches(provided, expected);
    const usernameOk =
      !username ||
      username.trim() === '' ||
      matches(
        typeof usernameHeader === 'string' ? usernameHeader : undefined,
        username,
      );

    if (!keyOk || !usernameOk) {
      throw new UnauthorizedException('Invalid or missing admin key');
    }
    return true;
  }
}
