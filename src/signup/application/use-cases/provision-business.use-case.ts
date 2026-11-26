// ===== CASO DE USO: PREPARAR UN NEGOCIO NUEVO =====
// Everything a new business needs once it exists: its base (local and
// schedule), its first owner, the session of that owner and the welcome. It
// must run inside the scope of the new business.

import { Inject, Injectable } from '@nestjs/common';
import { CreateAdminUserUseCase } from '../../../auth/application/use-cases/create-admin-user.use-case';
import {
  LoginAdminUseCase,
  LoginOutcome,
} from '../../../auth/application/use-cases/login-admin.use-case';
import { Result } from '../../../shared/domain/result';
import { ValidSignup } from '../../domain/signup.rules';
import { BUSINESS_SEEDER, BusinessSeeder } from '../ports/business-seeder.port';
import {
  WELCOME_NOTIFIER,
  WelcomeNotifier,
} from '../ports/welcome-notifier.port';

@Injectable()
export class ProvisionBusinessUseCase {
  constructor(
    @Inject(BUSINESS_SEEDER) private readonly seeder: BusinessSeeder,
    private readonly createUser: CreateAdminUserUseCase,
    private readonly login: LoginAdminUseCase,
    @Inject(WELCOME_NOTIFIER) private readonly welcome: WelcomeNotifier,
  ) {}

  async execute(
    signup: ValidSignup,
    userAgent?: string,
  ): Promise<Result<LoginOutcome>> {
    await this.seeder.seedBase();
    const owner = await this.createUser.execute({
      email: signup.email,
      name: signup.adminName,
      password: signup.password,
      role: 'owner',
    });
    if (!owner.ok) return owner;
    const session = await this.login.execute({
      email: signup.email,
      password: signup.password,
      userAgent,
    });
    if (!session.ok) return session;
    await this.welcome.send({
      to: signup.email,
      adminName: signup.adminName,
      businessName: signup.businessName,
    });
    return session;
  }
}
