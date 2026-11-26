import { Result } from '../../shared/domain/result';
import { ADMIN_MESSAGES, InvalidAdminUserError } from './admin-user.errors';
import {
  SESSION_TTL_MS,
  isSessionLive,
  normalizeEmail,
  validateName,
  validateNewAdminUser,
  validatePassword,
  validateRole,
  wouldLeaveNoOwner,
} from './admin-user.rules';

const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(`expected Ok: ${result.error.message}`);
  return result.value;
};

const rejects = (fn: () => Result<unknown>, message: string) => {
  const result = fn();
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(InvalidAdminUserError);
    expect(result.error.kind).toBe('validation');
    expect(result.error.message).toBe(message);
  }
};

describe('admin user rules', () => {
  describe('normalizeEmail', () => {
    it('trims and lowercases', () => {
      expect(valueOf(normalizeEmail('  Ana@Example.COM '))).toBe(
        'ana@example.com',
      );
    });

    it.each(['', '   ', 'plain', 'a@b', '@x.com', 'a b@x.com', 'a@@x.com'])(
      'rejects %j',
      (value) =>
        rejects(() => normalizeEmail(value), ADMIN_MESSAGES.invalidEmail),
    );

    it.each([undefined, null, 5, {}])('rejects a non-string (%j)', (value) =>
      rejects(() => normalizeEmail(value), ADMIN_MESSAGES.invalidEmail),
    );

    it('rejects an address longer than 254 characters', () => {
      rejects(
        () => normalizeEmail(`${'a'.repeat(250)}@x.com`),
        ADMIN_MESSAGES.invalidEmail,
      );
    });
  });

  describe('validateName', () => {
    it('trims and accepts 1 to 80 characters', () => {
      expect(valueOf(validateName('  Ana  '))).toBe('Ana');
      expect(valueOf(validateName('x'.repeat(80)))).toHaveLength(80);
    });

    it.each(['', '   ', 'x'.repeat(81), undefined, 7])('rejects %j', (value) =>
      rejects(() => validateName(value), ADMIN_MESSAGES.invalidName),
    );
  });

  describe('validatePassword', () => {
    it('accepts 10 to 128 characters and keeps them as typed', () => {
      expect(valueOf(validatePassword(' 1234567890 '))).toBe(' 1234567890 ');
      expect(valueOf(validatePassword('x'.repeat(128)))).toHaveLength(128);
    });

    it('rejects 9 characters', () => {
      rejects(
        () => validatePassword('123456789'),
        ADMIN_MESSAGES.shortPassword,
      );
    });

    it('rejects more than 128 characters', () => {
      rejects(
        () => validatePassword('x'.repeat(129)),
        ADMIN_MESSAGES.longPassword,
      );
    });

    it.each([undefined, null, 1234567890])('rejects a non-string (%j)', (v) =>
      rejects(() => validatePassword(v), ADMIN_MESSAGES.shortPassword),
    );
  });

  describe('validateRole', () => {
    it.each(['owner', 'staff', 'viewer'])('accepts %s', (role) => {
      expect(valueOf(validateRole(role))).toBe(role);
    });

    it.each(['admin', 'OWNER', '', undefined, 3])('rejects %j', (role) =>
      rejects(() => validateRole(role), ADMIN_MESSAGES.invalidRole),
    );
  });

  describe('validateNewAdminUser', () => {
    it('answers the normalized fields', () => {
      expect(
        valueOf(
          validateNewAdminUser({
            email: ' Ana@X.com',
            name: ' Ana ',
            password: 'a-long-password',
            role: 'staff',
          }),
        ),
      ).toEqual({
        email: 'ana@x.com',
        name: 'Ana',
        password: 'a-long-password',
        role: 'staff',
      });
    });

    it('stops at the first broken rule (email, name, password, role)', () => {
      rejects(
        () =>
          validateNewAdminUser({
            email: 'bad',
            name: '',
            password: 'x',
            role: 'nope',
          }),
        ADMIN_MESSAGES.invalidEmail,
      );
      rejects(
        () =>
          validateNewAdminUser({
            email: 'a@x.com',
            name: '',
            password: 'x',
            role: 'nope',
          }),
        ADMIN_MESSAGES.invalidName,
      );
      rejects(
        () =>
          validateNewAdminUser({
            email: 'a@x.com',
            name: 'A',
            password: 'x',
            role: 'nope',
          }),
        ADMIN_MESSAGES.shortPassword,
      );
      rejects(
        () =>
          validateNewAdminUser({
            email: 'a@x.com',
            name: 'A',
            password: 'long-enough-pw',
            role: 'nope',
          }),
        ADMIN_MESSAGES.invalidRole,
      );
    });
  });

  describe('wouldLeaveNoOwner', () => {
    const owner = { role: 'owner', active: true } as const;

    it('is true when the only active owner loses the role or the account', () => {
      expect(wouldLeaveNoOwner(owner, { role: 'staff' }, 1)).toBe(true);
      expect(wouldLeaveNoOwner(owner, { active: false }, 1)).toBe(true);
    });

    it('is false when another active owner remains', () => {
      expect(wouldLeaveNoOwner(owner, { role: 'viewer' }, 2)).toBe(false);
      expect(wouldLeaveNoOwner(owner, { active: false }, 2)).toBe(false);
    });

    it('is false when the target stays an active owner', () => {
      expect(wouldLeaveNoOwner(owner, { role: 'owner' }, 1)).toBe(false);
      expect(wouldLeaveNoOwner(owner, {}, 1)).toBe(false);
    });

    it('is false when the target is not an active owner already', () => {
      expect(
        wouldLeaveNoOwner(
          { role: 'staff', active: true },
          { active: false },
          1,
        ),
      ).toBe(false);
      expect(
        wouldLeaveNoOwner(
          { role: 'owner', active: false },
          { role: 'staff' },
          1,
        ),
      ).toBe(false);
    });
  });

  describe('isSessionLive', () => {
    const now = new Date('2026-01-01T00:00:00Z');

    it('is live before its expiry and dead at or after it', () => {
      expect(
        isSessionLive({ expiresAt: new Date(now.getTime() + 1) }, now),
      ).toBe(true);
      expect(isSessionLive({ expiresAt: now }, now)).toBe(false);
      expect(
        isSessionLive({ expiresAt: new Date(now.getTime() - 1) }, now),
      ).toBe(false);
    });

    it('lasts 7 days', () => {
      expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
