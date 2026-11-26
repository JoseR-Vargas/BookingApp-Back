import { Result } from '../../../shared/domain/result';
import { Clock } from '../../../shared/application/clock.port';
import { PasswordHasher } from '../ports/password-hasher.port';
import { InMemoryAdminSessionRepository } from '../../infrastructure/persistence/in-memory/in-memory-admin-session.repository';
import { InMemoryAdminUserRepository } from '../../infrastructure/persistence/in-memory/in-memory-admin-user.repository';
import { NodeSessionTokens } from '../../infrastructure/crypto/node-session-tokens';
import { ADMIN_MESSAGES } from '../../domain/admin-user.errors';
import { SESSION_TTL_MS } from '../../domain/admin-user.rules';
import { AuthenticateAdminSessionUseCase } from './authenticate-admin-session.use-case';
import { ChangeAdminUserRoleUseCase } from './change-admin-user-role.use-case';
import { CreateAdminUserUseCase } from './create-admin-user.use-case';
import { DeactivateAdminUserUseCase } from './deactivate-admin-user.use-case';
import { ListAdminUsersUseCase } from './list-admin-users.use-case';
import { LoginAdminUseCase } from './login-admin.use-case';
import { LogoutAdminUseCase } from './logout-admin.use-case';
import { RotateAdminPasswordUseCase } from './rotate-admin-password.use-case';

/** A fast, deterministic hasher: the real scrypt has its own spec. */
class FakeHasher implements PasswordHasher {
  verifyCalls: (string | null)[] = [];
  hash(plain: string): Promise<string> {
    return Promise.resolve(`fake:${plain}`);
  }
  verify(plain: string, hash: string | null): Promise<boolean> {
    this.verifyCalls.push(hash);
    return Promise.resolve(hash === `fake:${plain}`);
  }
}

const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(`expected Ok: ${result.error.message}`);
  return result.value;
};
const errorOf = (result: Result<unknown>) => {
  if (result.ok) throw new Error('expected Err');
  return result.error;
};

describe('admin accounts use cases', () => {
  let now: Date;
  let users: InMemoryAdminUserRepository;
  let sessions: InMemoryAdminSessionRepository;
  let hasher: FakeHasher;
  const tokens = new NodeSessionTokens();
  const clock: Clock = { now: () => now };

  let create: CreateAdminUserUseCase;
  let login: LoginAdminUseCase;
  let logout: LogoutAdminUseCase;
  let authenticate: AuthenticateAdminSessionUseCase;
  let changeRole: ChangeAdminUserRoleUseCase;
  let deactivate: DeactivateAdminUserUseCase;
  let rotate: RotateAdminPasswordUseCase;
  let list: ListAdminUsersUseCase;

  beforeEach(() => {
    now = new Date('2026-03-01T12:00:00.000Z');
    users = new InMemoryAdminUserRepository();
    sessions = new InMemoryAdminSessionRepository();
    hasher = new FakeHasher();
    create = new CreateAdminUserUseCase(users, hasher, clock);
    login = new LoginAdminUseCase(
      users,
      users,
      sessions,
      hasher,
      tokens,
      clock,
    );
    logout = new LogoutAdminUseCase(sessions, tokens);
    authenticate = new AuthenticateAdminSessionUseCase(
      sessions,
      users,
      tokens,
      clock,
    );
    changeRole = new ChangeAdminUserRoleUseCase(users, users);
    deactivate = new DeactivateAdminUserUseCase(users, users, sessions);
    rotate = new RotateAdminPasswordUseCase(users, sessions, hasher);
    list = new ListAdminUsersUseCase(users);
  });

  const newUser = (over: Record<string, unknown> = {}) =>
    create.execute({
      email: 'Ana@Example.com',
      name: 'Ana',
      password: 'a-long-password',
      role: 'owner',
      ...over,
    });

  describe('CreateAdminUser', () => {
    it('stores a normalized, active account and never keeps the plain password', async () => {
      const user = valueOf(await newUser());
      expect(user).toMatchObject({
        email: 'ana@example.com',
        name: 'Ana',
        role: 'owner',
        active: true,
        createdAt: now,
        lastLoginAt: null,
      });
      const creds = await users.findCredentialsByEmail('ana@example.com');
      expect(creds?.passwordHash).toBe('fake:a-long-password');
    });

    it('rejects a rule violation and stores nothing', async () => {
      const error = errorOf(await newUser({ password: 'short' }));
      expect(error.message).toBe(ADMIN_MESSAGES.shortPassword);
      await expect(users.list()).resolves.toEqual([]);
    });

    it('answers a conflict for a repeated email', async () => {
      await newUser();
      const error = errorOf(await newUser({ name: 'Other' }));
      expect(error.kind).toBe('conflict');
      expect(error.message).toBe(ADMIN_MESSAGES.emailTaken);
      await expect(users.list()).resolves.toHaveLength(1);
    });
  });

  describe('Login', () => {
    beforeEach(async () => {
      await newUser();
    });

    it('opens a 7-day session, stores only the token hash and records the login', async () => {
      const outcome = valueOf(
        await login.execute({
          email: ' ANA@example.com ',
          password: 'a-long-password',
          userAgent: 'jest',
        }),
      );
      expect(outcome.expiresAt).toEqual(
        new Date(now.getTime() + SESSION_TTL_MS),
      );
      expect(outcome.user.lastLoginAt).toEqual(now);
      expect(outcome.user).not.toHaveProperty('passwordHash');
      const stored = await sessions.findByTokenHash(tokens.hash(outcome.token));
      expect(stored).toMatchObject({
        userId: outcome.user.id,
        expiresAt: outcome.expiresAt,
        userAgent: 'jest',
      });
      expect(stored?.tokenHash).not.toBe(outcome.token);
      expect(await sessions.findByTokenHash(outcome.token)).toBeNull();
    });

    it.each([
      ['unknown email', 'nobody@example.com', 'a-long-password'],
      ['wrong password', 'ana@example.com', 'wrong-password-1'],
      ['malformed email', 'not-an-email', 'a-long-password'],
      ['non-string email', 42, 'a-long-password'],
      ['non-string password', 'ana@example.com', { $ne: 1 }],
    ])('fails the same way for %s', async (_label, email, password) => {
      const error = errorOf(await login.execute({ email, password }));
      expect(error.message).toBe('Correo o contraseña incorrectos');
      expect(error.message).toBe(ADMIN_MESSAGES.invalidCredentials);
    });

    it('fails the same way for an inactive account, after a real password check', async () => {
      const owner = valueOf(
        await newUser({ email: 'b@example.com', role: 'owner' }),
      );
      await users.update(owner.id, { active: false });
      hasher.verifyCalls = [];
      const error = errorOf(
        await login.execute({
          email: 'b@example.com',
          password: 'a-long-password',
        }),
      );
      expect(error.message).toBe(ADMIN_MESSAGES.invalidCredentials);
      expect(hasher.verifyCalls).toEqual(['fake:a-long-password']);
    });

    it('does the password work even when the account does not exist', async () => {
      hasher.verifyCalls = [];
      await login.execute({
        email: 'nobody@example.com',
        password: 'whatever-pass',
      });
      await login.execute({ email: 'bad', password: 'whatever-pass' });
      expect(hasher.verifyCalls).toEqual([null, null]);
    });

    it('opens no session on a failure', async () => {
      await login.execute({
        email: 'ana@example.com',
        password: 'nope-nope-nope',
      });
      const outcome = valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'a-long-password',
        }),
      );
      await logout.execute(outcome.token);
      await expect(authenticate.execute(outcome.token)).resolves.toMatchObject({
        ok: false,
      });
    });
  });

  describe('Authenticate + Logout', () => {
    it('answers the account of a live session', async () => {
      await newUser();
      const { token, user } = valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'a-long-password',
        }),
      );
      expect(valueOf(await authenticate.execute(token))).toEqual(user);
    });

    it('rejects an unknown token, an expired session and a revoked one', async () => {
      await newUser();
      const { token } = valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'a-long-password',
        }),
      );
      expect(errorOf(await authenticate.execute('nope')).message).toBe(
        ADMIN_MESSAGES.invalidSession,
      );

      now = new Date(now.getTime() + SESSION_TTL_MS);
      expect(errorOf(await authenticate.execute(token)).message).toBe(
        ADMIN_MESSAGES.invalidSession,
      );

      now = new Date(now.getTime() - SESSION_TTL_MS + 1000);
      expect(valueOf(await authenticate.execute(token)).email).toBe(
        'ana@example.com',
      );
      valueOf(await logout.execute(token));
      expect(errorOf(await authenticate.execute(token)).message).toBe(
        ADMIN_MESSAGES.invalidSession,
      );
    });

    it('logging out with an unknown token is not an error', async () => {
      expect(valueOf(await logout.execute('nope'))).toBe(true);
    });

    it('rejects the session of an account deactivated afterwards', async () => {
      await newUser();
      const staff = valueOf(
        await newUser({ email: 's@example.com', role: 'staff' }),
      );
      const { token } = valueOf(
        await login.execute({
          email: 's@example.com',
          password: 'a-long-password',
        }),
      );
      valueOf(await deactivate.execute(staff.id));
      expect(errorOf(await authenticate.execute(token)).message).toBe(
        ADMIN_MESSAGES.invalidSession,
      );
    });
  });

  describe('ChangeAdminUserRole', () => {
    it('changes the role of another account', async () => {
      await newUser();
      const staff = valueOf(
        await newUser({ email: 's@example.com', role: 'staff' }),
      );
      expect(valueOf(await changeRole.execute(staff.id, 'viewer')).role).toBe(
        'viewer',
      );
    });

    it('rejects an invalid role and an unknown account', async () => {
      const owner = valueOf(await newUser());
      expect(errorOf(await changeRole.execute(owner.id, 'god')).message).toBe(
        ADMIN_MESSAGES.invalidRole,
      );
      expect(errorOf(await changeRole.execute('nope', 'staff')).kind).toBe(
        'not-found',
      );
    });

    it('refuses to demote the last active owner, with a 409-kind error', async () => {
      const owner = valueOf(await newUser());
      const error = errorOf(await changeRole.execute(owner.id, 'staff'));
      expect(error.kind).toBe('conflict');
      expect(error.message).toBe(ADMIN_MESSAGES.lastOwner);
      await expect(users.findById(owner.id)).resolves.toMatchObject({
        role: 'owner',
      });
    });

    it('allows the demotion when another active owner remains', async () => {
      const first = valueOf(await newUser());
      valueOf(await newUser({ email: 'b@example.com' }));
      expect(valueOf(await changeRole.execute(first.id, 'staff')).role).toBe(
        'staff',
      );
    });
  });

  describe('DeactivateAdminUser', () => {
    it('deactivates the account and revokes its sessions', async () => {
      await newUser();
      const staff = valueOf(
        await newUser({ email: 's@example.com', role: 'staff' }),
      );
      const { token } = valueOf(
        await login.execute({
          email: 's@example.com',
          password: 'a-long-password',
        }),
      );
      expect(valueOf(await deactivate.execute(staff.id)).active).toBe(false);
      await expect(
        sessions.findByTokenHash(tokens.hash(token)),
      ).resolves.toBeNull();
      expect(
        errorOf(
          await login.execute({
            email: 's@example.com',
            password: 'a-long-password',
          }),
        ).message,
      ).toBe(ADMIN_MESSAGES.invalidCredentials);
    });

    it('refuses to deactivate the last active owner and keeps its sessions', async () => {
      const owner = valueOf(await newUser());
      const { token } = valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'a-long-password',
        }),
      );
      const error = errorOf(await deactivate.execute(owner.id));
      expect(error.kind).toBe('conflict');
      expect(error.message).toBe(ADMIN_MESSAGES.lastOwner);
      await expect(users.findById(owner.id)).resolves.toMatchObject({
        active: true,
      });
      expect(valueOf(await authenticate.execute(token)).id).toBe(owner.id);
    });

    it('answers not-found for an unknown account', async () => {
      expect(errorOf(await deactivate.execute('nope')).kind).toBe('not-found');
    });
  });

  describe('RotateAdminPassword', () => {
    it('sets the new password and revokes the open sessions', async () => {
      const owner = valueOf(await newUser());
      const { token } = valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'a-long-password',
        }),
      );
      valueOf(await rotate.execute(owner.id, 'brand-new-password'));
      await expect(
        sessions.findByTokenHash(tokens.hash(token)),
      ).resolves.toBeNull();
      expect(
        errorOf(
          await login.execute({
            email: 'ana@example.com',
            password: 'a-long-password',
          }),
        ).kind,
      ).toBe('forbidden');
      valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'brand-new-password',
        }),
      );
    });

    it('rejects a short password and keeps the old one', async () => {
      const owner = valueOf(await newUser());
      expect(errorOf(await rotate.execute(owner.id, 'short')).message).toBe(
        ADMIN_MESSAGES.shortPassword,
      );
      valueOf(
        await login.execute({
          email: 'ana@example.com',
          password: 'a-long-password',
        }),
      );
    });

    it('answers not-found for an unknown account', async () => {
      expect(
        errorOf(await rotate.execute('nope', 'brand-new-password')).kind,
      ).toBe('not-found');
    });
  });

  describe('ListAdminUsers', () => {
    it('lists the accounts without secrets', async () => {
      await newUser();
      await newUser({ email: 's@example.com', role: 'staff' });
      const all = valueOf(await list.execute());
      expect(all.map((u) => u.email)).toEqual([
        'ana@example.com',
        's@example.com',
      ]);
      for (const user of all) expect(user).not.toHaveProperty('passwordHash');
    });
  });
});
