import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';

const contextWith = (authorization?: string | string[]): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization === undefined ? {} : { authorization },
      }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminKeyGuard', () => {
  const guard = new AdminKeyGuard();
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = 'test-admin-key';
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = saved;
    }
  });

  it('allows a request with the correct Bearer key', () => {
    expect(guard.canActivate(contextWith('Bearer test-admin-key'))).toBe(true);
  });

  it('accepts a case-insensitive Bearer scheme', () => {
    expect(guard.canActivate(contextWith('bearer test-admin-key'))).toBe(true);
  });

  it.each([
    ['no Authorization header', undefined],
    ['an empty header', ''],
    ['a wrong key', 'Bearer wrong-key'],
    ['a key that is a prefix of the real one', 'Bearer test-admin'],
    ['a key longer than the real one', 'Bearer test-admin-key-and-more'],
    ['a non-Bearer scheme', 'Basic test-admin-key'],
    ['the bare key without a scheme', 'test-admin-key'],
    ['a Bearer scheme without key', 'Bearer'],
    ['a Bearer scheme with an empty key', 'Bearer '],
    ['extra tokens after the key', 'Bearer test-admin-key extra'],
    ['a repeated header', ['Bearer test-admin-key', 'Bearer other']],
  ])('rejects %s with 401', (_label, header) => {
    expect(() => guard.canActivate(contextWith(header))).toThrow(
      UnauthorizedException,
    );
  });

  describe('fails closed when ADMIN_API_KEY is not configured', () => {
    it.each([
      ['unset', undefined],
      ['empty', ''],
      ['blank', '   '],
    ])('rejects everything when the variable is %s', (_label, value) => {
      if (value === undefined) {
        delete process.env.ADMIN_API_KEY;
      } else {
        process.env.ADMIN_API_KEY = value;
      }

      expect(() => guard.canActivate(contextWith('Bearer '))).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.canActivate(contextWith('Bearer x'))).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.canActivate(contextWith(value))).toThrow(
        UnauthorizedException,
      );
    });
  });

  it('reads the key at request time, not at construction', () => {
    const early = new AdminKeyGuard();
    process.env.ADMIN_API_KEY = 'rotated-key';

    expect(early.canActivate(contextWith('Bearer rotated-key'))).toBe(true);
    expect(() =>
      early.canActivate(contextWith('Bearer test-admin-key')),
    ).toThrow(UnauthorizedException);
  });
});
