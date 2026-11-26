/**
 * Test-only wiring: the auth controllers over the in-memory adapters, with the
 * same use cases and tokens as `auth.module.ts` and no database.
 */
import { Provider } from '@nestjs/common';
import { CLOCK, Clock } from '../shared/application/clock.port';
import { ADMIN_SESSION_READER } from './application/ports/admin-session.reader';
import { ADMIN_SESSION_WRITER } from './application/ports/admin-session.writer';
import { ADMIN_USER_READER } from './application/ports/admin-user.reader';
import { ADMIN_USER_WRITER } from './application/ports/admin-user.writer';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { SESSION_TOKENS } from './application/ports/session-tokens.port';
import { AuthenticateAdminSessionUseCase } from './application/use-cases/authenticate-admin-session.use-case';
import { ChangeAdminUserRoleUseCase } from './application/use-cases/change-admin-user-role.use-case';
import { CreateAdminUserUseCase } from './application/use-cases/create-admin-user.use-case';
import { DeactivateAdminUserUseCase } from './application/use-cases/deactivate-admin-user.use-case';
import { ListAdminUsersUseCase } from './application/use-cases/list-admin-users.use-case';
import { LoginAdminUseCase } from './application/use-cases/login-admin.use-case';
import { LogoutAdminUseCase } from './application/use-cases/logout-admin.use-case';
import { RotateAdminPasswordUseCase } from './application/use-cases/rotate-admin-password.use-case';
import { AdminLoginController } from './infrastructure/http/admin-login.controller';
import { AdminUsersController } from './infrastructure/http/admin-users.controller';
import { NodeSessionTokens } from './infrastructure/crypto/node-session-tokens';
import { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher';
import { InMemoryAdminSessionRepository } from './infrastructure/persistence/in-memory/in-memory-admin-session.repository';
import { InMemoryAdminUserRepository } from './infrastructure/persistence/in-memory/in-memory-admin-user.repository';
import { AdminSessionController } from './admin-session.controller';

export const AUTH_CONTROLLERS = [
  AdminSessionController,
  AdminLoginController,
  AdminUsersController,
];

export const AUTH_USE_CASES = [
  LoginAdminUseCase,
  LogoutAdminUseCase,
  AuthenticateAdminSessionUseCase,
  CreateAdminUserUseCase,
  ListAdminUsersUseCase,
  ChangeAdminUserRoleUseCase,
  DeactivateAdminUserUseCase,
  RotateAdminPasswordUseCase,
];

/** Binds every auth port to the in-memory adapters (the swap proof). */
export function inMemoryAuthProviders(
  users: InMemoryAdminUserRepository,
  sessions: InMemoryAdminSessionRepository,
  clock: Clock,
): Provider[] {
  return [
    { provide: ADMIN_USER_READER, useValue: users },
    { provide: ADMIN_USER_WRITER, useValue: users },
    { provide: ADMIN_SESSION_READER, useValue: sessions },
    { provide: ADMIN_SESSION_WRITER, useValue: sessions },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKENS, useClass: NodeSessionTokens },
    { provide: CLOCK, useValue: clock },
    ...AUTH_USE_CASES,
  ];
}
