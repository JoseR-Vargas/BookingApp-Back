import type { CookieOptions } from 'express';

/** The cookie that carries the opaque session token. */
export const SESSION_COOKIE = 'admin_session';

/** The session token inside a `Cookie` header, if any. */
export function readSessionToken(
  header: string | string[] | undefined,
): string | undefined {
  if (typeof header !== 'string') return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      const value = rest.join('=');
      try {
        return value ? decodeURIComponent(value) : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** `HttpOnly; SameSite=Lax`, and `Secure` in production. */
export const sessionCookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  ...(expires ? { expires } : {}),
});
