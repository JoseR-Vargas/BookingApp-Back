// ===== CASO DE USO: ALTA DE UN NEGOCIO =====
// Creates a business, its base, its first owner and the owner's session in one
// operation (spec 21). The business is created outside any scope (it has none
// yet); everything else runs inside the new business. If a step fails after
// the business exists, everything created for it is deleted.

import { Inject, Injectable } from '@nestjs/common';
import { AdminUser } from '../../../auth/domain/admin-user';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../../../shared/application/tenant-context.port';
import { Result, ok } from '../../../shared/domain/result';
import {
  TENANT_ERASER,
  TenantEraser,
} from '../../../tenancy/application/ports/tenant-eraser.port';
import { TenantService } from '../../../tenancy/application/tenant.service';
import { newTrial } from '../../../tenancy/domain/trial.rules';
import { SignupDraft, validateSignup } from '../../domain/signup.rules';
import { withCompensation } from '../with-compensation';
import { ProvisionBusinessUseCase } from './provision-business.use-case';

export interface SignUpCommand extends SignupDraft {
  userAgent?: string;
}

/** What a successful signup hands to the HTTP edge: the plain token goes in the cookie only. */
export interface SignUpOutcome {
  tenant: { slug: string; name: string };
  user: AdminUser;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SignUpBusinessUseCase {
  constructor(
    private readonly tenants: TenantService,
    private readonly provision: ProvisionBusinessUseCase,
    @Inject(TENANT_SCOPE) private readonly scope: TenantScope,
    @Inject(TENANT_ERASER) private readonly eraser: TenantEraser,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SignUpCommand): Promise<Result<SignUpOutcome>> {
    const valid = validateSignup(command);
    if (!valid.ok) return valid;
    const signup = valid.value;

    const created = await this.tenants.create({
      slug: signup.slug,
      name: signup.businessName,
      trial: newTrial(this.clock.now()),
    });
    if (!created.ok) return created;
    const tenant = created.value;

    return withCompensation(
      async () => {
        const opened = await this.scope.run(
          { id: tenant.id, slug: tenant.slug, isDefault: false },
          () => this.provision.execute(signup, command.userAgent),
        );
        if (!opened.ok) return opened;
        return ok({
          tenant: { slug: tenant.slug, name: tenant.name },
          user: opened.value.user,
          token: opened.value.token,
          expiresAt: opened.value.expiresAt,
        });
      },
      () => this.eraser.erase(tenant.id),
    );
  }
}
