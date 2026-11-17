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

  describe('ADMIN_USERNAME', () => {
    const ctx = (
      username?: string | string[],
      authorization: string | undefined = 'Bearer test-admin-key',
    ): ExecutionContext =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              ...(authorization === undefined ? {} : { authorization }),
              ...(username === undefined
                ? {}
                : { 'x-admin-username': username }),
            },
          }),
        }),
      }) as unknown as ExecutionContext;
    const messageOf = (context: ExecutionContext): unknown => {
      try {
        guard.canActivate(context);
      } catch (error) {
        return (error as UnauthorizedException).getResponse();
      }
      return undefined;
    };
    let savedUsername: string | undefined;

    beforeEach(() => {
      savedUsername = process.env.ADMIN_USERNAME;
    });

    afterEach(() => {
      if (savedUsername === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = savedUsername;
    });

    it.each([
      ['unset', undefined],
      ['empty', ''],
      ['blank', '   '],
    ])('does not check the username when the variable is %s', (_l, value) => {
      if (value === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = value;

      expect(guard.canActivate(ctx())).toBe(true);
      expect(guard.canActivate(ctx('anything'))).toBe(true);
    });

    it('allows the correct username with the correct key', () => {
      process.env.ADMIN_USERNAME = 'Admin';
      expect(guard.canActivate(ctx('Admin'))).toBe(true);
    });

    it.each([
      ['a missing header', undefined],
      ['a wrong value', 'other'],
      ['a different case', 'admin'],
      ['a repeated header', ['Admin', 'Admin']],
    ])('rejects %s with 401 when the username is set', (_l, header) => {
      process.env.ADMIN_USERNAME = 'Admin';
      expect(() => guard.canActivate(ctx(header))).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects the correct username with a wrong or missing key', () => {
      process.env.ADMIN_USERNAME = 'Admin';
      expect(() => guard.canActivate(ctx('Admin', 'Bearer nope'))).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.canActivate(ctx('Admin', ''))).toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed with a matching username but no configured key', () => {
      process.env.ADMIN_USERNAME = 'Admin';
      delete process.env.ADMIN_API_KEY;
      expect(() => guard.canActivate(ctx('Admin'))).toThrow(
        UnauthorizedException,
      );
    });

    it('answers every failure with the same 401 body', () => {
      process.env.ADMIN_USERNAME = 'Admin';
      const wrongKey = messageOf(ctx('Admin', 'Bearer nope'));
      expect(wrongKey).toEqual({
        message: 'Invalid or missing admin key',
        error: 'Unauthorized',
        statusCode: 401,
      });
      expect(messageOf(ctx())).toEqual(wrongKey);
      expect(messageOf(ctx('wrong'))).toEqual(wrongKey);
      expect(messageOf(ctx(['Admin', 'Admin']))).toEqual(wrongKey);
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
