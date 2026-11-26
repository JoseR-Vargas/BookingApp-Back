// A manual change of the plan of a business (spec 25): no gateway, no
// charge. The change leaves a trace in the log of the system with the
// business, the old plan and the new one.

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { SUBSCRIPTION_ADMINISTRATOR } from '../../../billing/application/ports/subscription-administrator.port';
import { SubscriptionAdministrator } from '../../../billing/application/ports/subscription-administrator.port';
import { PlatformBusiness, findBusiness } from '../../domain/platform-business';
import { PlatformBusinessNotFound } from '../../domain/platform.errors';
import { canChangePlan } from '../../domain/platform.rules';
import { PlatformBusinessReader } from '../platform-business-reader';
import { PLATFORM_AUDIT } from '../ports/platform-audit.port';
import { PlatformAudit } from '../ports/platform-audit.port';

@Injectable()
export class ChangePlanUseCase {
  constructor(
    private readonly reader: PlatformBusinessReader,
    @Inject(SUBSCRIPTION_ADMINISTRATOR)
    private readonly subscriptions: SubscriptionAdministrator,
    @Inject(PLATFORM_AUDIT) private readonly audit: PlatformAudit,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    id: string,
    planId: unknown,
  ): Promise<Result<PlatformBusiness>> {
    const now = this.clock.now();
    const business = findBusiness(await this.reader.list(), id);
    if (!business) return err(new PlatformBusinessNotFound());
    const allowed = canChangePlan(
      { planId: business.plan ? business.plan.id : null },
      planId,
    );
    if (!allowed.ok) return err(allowed.error);

    const change = await this.subscriptions.changePlan(
      business.id,
      allowed.value,
      now,
    );
    await this.audit.record({
      businessId: business.id,
      action: 'change-plan',
      from: change.previousPlanId,
      to: change.planId,
      detail: 'cambio manual, sin pasarela de pago',
    });
    const updated = findBusiness(await this.reader.list(), business.id);
    return updated ? ok(updated) : err(new PlatformBusinessNotFound());
  }
}
