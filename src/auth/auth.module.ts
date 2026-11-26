import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { AdminSessionController } from './admin-session.controller';
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
import { BillingModule } from '../billing/billing.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { NodeSessionTokens } from './infrastructure/crypto/node-session-tokens';
import { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher';
import { AdminLoginController } from './infrastructure/http/admin-login.controller';
import { AdminUsersController } from './infrastructure/http/admin-users.controller';
import {
  AdminSessionRecord,
  AdminSessionSchema,
} from './infrastructure/persistence/mongo/admin-session.entity';
import {
  AdminUserRecord,
  AdminUserSchema,
} from './infrastructure/persistence/mongo/admin-user.entity';
import { MongoAdminSessionRepository } from './infrastructure/persistence/mongo/mongo-admin-session.repository';
import { MongoAdminUserRepository } from './infrastructure/persistence/mongo/mongo-admin-user.repository';

/**
 * Composition root of the admin accounts (spec 20): the only place where ports
 * are bound to adapters. It is global because `AdminKeyGuard`, used by the
 * controllers of other modules, needs the session use case.
 */
@Global()
@Module({
  imports: [
    // The session answers the trial of the business (spec 21).
    TenancyModule,
    // ... and its plan (spec 23).
    BillingModule,
    MongooseModule.forFeature([
      { name: AdminUserRecord.name, schema: AdminUserSchema },
      { name: AdminSessionRecord.name, schema: AdminSessionSchema },
    ]),
  ],
  controllers: [
    AdminSessionController,
    AdminLoginController,
    AdminUsersController,
  ],
  providers: [
    MongoAdminUserRepository,
    MongoAdminSessionRepository,
    { provide: ADMIN_USER_READER, useExisting: MongoAdminUserRepository },
    { provide: ADMIN_USER_WRITER, useExisting: MongoAdminUserRepository },
    { provide: ADMIN_SESSION_READER, useExisting: MongoAdminSessionRepository },
    { provide: ADMIN_SESSION_WRITER, useExisting: MongoAdminSessionRepository },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKENS, useClass: NodeSessionTokens },
    { provide: CLOCK, useClass: SystemClock },
    LoginAdminUseCase,
    LogoutAdminUseCase,
    AuthenticateAdminSessionUseCase,
    CreateAdminUserUseCase,
    ListAdminUsersUseCase,
    ChangeAdminUserRoleUseCase,
    DeactivateAdminUserUseCase,
    RotateAdminPasswordUseCase,
  ],
  exports: [
    AuthenticateAdminSessionUseCase,
    CreateAdminUserUseCase,
    LoginAdminUseCase,
  ],
})
export class AuthModule {}
