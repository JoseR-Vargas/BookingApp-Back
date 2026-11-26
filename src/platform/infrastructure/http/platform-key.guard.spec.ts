import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { EnvPlatformCredentials } from '../credentials/env-platform-credentials';
import { PlatformKeyGuard } from './platform-key.guard';

const contextWith = (headers: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as unknown as ExecutionContext;

describe('PlatformKeyGuard (spec 25)', () => {
  const guard = new PlatformKeyGuard(new EnvPlatformCredentials());
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.PLATFORM_API_KEY;
    process.env.PLATFORM_API_KEY = 'platform-key-of-the-owner';
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.PLATFORM_API_KEY;
    else process.env.PLATFORM_API_KEY = saved;
  });

  it('opens the route with the platform key in the x-platform-key header', () => {
    expect(
      guard.canActivate(
        contextWith({ 'x-platform-key': 'platform-key-of-the-owner' }),
      ),
    ).toBe(true);
  });

  it('opens the route with the platform key as a Bearer token', () => {
    expect(
      guard.canActivate(
        contextWith({ authorization: 'Bearer platform-key-of-the-owner' }),
      ),
    ).toBe(true);
  });

  it('accepts a case-insensitive Bearer scheme', () => {
    expect(
      guard.canActivate(
        contextWith({ authorization: 'bearer platform-key-of-the-owner' }),
      ),
    ).toBe(true);
  });

  it.each([
    ['no header at all', {}],
    ['an empty key', { 'x-platform-key': '' }],
    ['a wrong key', { 'x-platform-key': 'nope' }],
    [
      'a key that is a prefix of the real one',
      { 'x-platform-key': 'platform-key' },
    ],
    [
      'a key longer than the real one',
      { 'x-platform-key': 'platform-key-of-the-owner-and-more' },
    ],
    [
      'the admin key of a business',
      { authorization: 'Bearer admin-key-of-a-business' },
    ],
    ['a Bearer scheme without a key', { authorization: 'Bearer' }],
    [
      'a bare key without a scheme',
      { authorization: 'platform-key-of-the-owner' },
    ],
  ])('rejects %s with 401', (_label, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(
      UnauthorizedException,
    );
  });

  it('ignores the key of the x-platform-key header when it is empty and falls back to the Bearer token', () => {
    expect(
      guard.canActivate(
        contextWith({
          'x-platform-key': '',
          authorization: 'Bearer platform-key-of-the-owner',
        }),
      ),
    ).toBe(true);
  });

  describe('fails closed when PLATFORM_API_KEY is not configured', () => {
    it.each([
      ['unset', undefined],
      ['empty', ''],
      ['blank', '   '],
    ])('rejects everything when the variable is %s', (_label, value) => {
      if (value === undefined) delete process.env.PLATFORM_API_KEY;
      else process.env.PLATFORM_API_KEY = value;

      expect(() =>
        guard.canActivate(contextWith({ 'x-platform-key': 'anything' })),
      ).toThrow(UnauthorizedException);
      expect(() =>
        guard.canActivate(contextWith({ authorization: 'Bearer anything' })),
      ).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(contextWith({}))).toThrow(
        UnauthorizedException,
      );
    });
  });

  it('answers every failure with the same 401 body', () => {
    const bodyOf = (headers: Record<string, unknown>): unknown => {
      try {
        guard.canActivate(contextWith(headers));
      } catch (error) {
        return (error as UnauthorizedException).getResponse();
      }
      return undefined;
    };
    const wrong = bodyOf({ 'x-platform-key': 'nope' });

    expect(wrong).toEqual({
      message: 'Clave de plataforma inválida o ausente.',
      error: 'Unauthorized',
      statusCode: 401,
    });
    expect(bodyOf({})).toEqual(wrong);
    expect(bodyOf({ authorization: 'Bearer nope' })).toEqual(wrong);
  });

  it('reads the key at request time, not at construction', () => {
    const early = new PlatformKeyGuard(new EnvPlatformCredentials());
    process.env.PLATFORM_API_KEY = 'rotated-platform-key';

    expect(
      early.canActivate(
        contextWith({ 'x-platform-key': 'rotated-platform-key' }),
      ),
    ).toBe(true);
    expect(() =>
      early.canActivate(
        contextWith({ 'x-platform-key': 'platform-key-of-the-owner' }),
      ),
    ).toThrow(UnauthorizedException);
  });
});
