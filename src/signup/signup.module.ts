// ===== MÓDULO DE ALTA DE NEGOCIOS =====
// Composition root of the signup (spec 21): the only place where its ports
// are bound to adapters.

import { Module } from '@nestjs/common';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { CatalogModule } from '../catalog/catalog.module';
import { EmailModule } from '../email/email.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BUSINESS_SEEDER } from './application/ports/business-seeder.port';
import { SIGNUP_RATE_LIMITER } from './application/ports/signup-rate-limiter.port';
import { WELCOME_NOTIFIER } from './application/ports/welcome-notifier.port';
import { ProvisionBusinessUseCase } from './application/use-cases/provision-business.use-case';
import { SignUpBusinessUseCase } from './application/use-cases/sign-up-business.use-case';
import { CatalogBusinessSeeder } from './infrastructure/catalog-business-seeder';
import { EmailWelcomeNotifier } from './infrastructure/email-welcome-notifier';
import { SignupController } from './infrastructure/http/signup.controller';
import {
  DEFAULT_SIGNUP_LIMIT,
  InMemorySignupRateLimiter,
} from './infrastructure/rate-limit/in-memory-signup-rate-limiter';

/** `SIGNUP_RATE_LIMIT_MAX` overrides the 5 signups per hour per IP (tests, staging). */
const signupLimit = () => {
  const max = Number(process.env.SIGNUP_RATE_LIMIT_MAX);
  return {
    ...DEFAULT_SIGNUP_LIMIT,
    max: Number.isInteger(max) && max > 0 ? max : DEFAULT_SIGNUP_LIMIT.max,
  };
};

@Module({
  // AuthModule is global: CreateAdminUserUseCase and LoginAdminUseCase come from it.
  // CatalogModule is imported so its seeder exists when the module reference looks it up.
  imports: [TenancyModule, EmailModule, CatalogModule],
  controllers: [SignupController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: BUSINESS_SEEDER, useClass: CatalogBusinessSeeder },
    { provide: WELCOME_NOTIFIER, useClass: EmailWelcomeNotifier },
    {
      provide: SIGNUP_RATE_LIMITER,
      useFactory: () =>
        new InMemorySignupRateLimiter(new SystemClock(), signupLimit()),
    },
    ProvisionBusinessUseCase,
    SignUpBusinessUseCase,
  ],
})
export class SignupModule {}
