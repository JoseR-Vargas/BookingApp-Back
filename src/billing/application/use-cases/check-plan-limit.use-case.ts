// ===== CASO DE USO: COMPROBAR EL LÍMITE DEL PLAN =====
// The plan gate (spec 23): may the business create one more professional,
// location or booking? A business WITHOUT a subscription is not governed by a
// plan: it answers `governs: false` and the trial and storage rules stay as
// they were. Reads, availability and existing bookings never come here.
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import {
  PlanResource,
  PlanVerdict,
} from '../../../shared/application/plan-gate.port';
import { DomainError } from '../../../shared/domain/domain-error';
import { Result, err, ok } from '../../../shared/domain/result';
import { SubscriptionEnded } from '../../domain/billing.errors';
import {
  LimitedResource,
  checkLimit,
  monthBounds,
} from '../../domain/limits.rules';
import { allowsNewBookings } from '../../domain/subscription.rules';
import { PLAN_USAGE_READER, PlanUsageReader } from '../ports/plan-usage.reader';
import {
  SUBSCRIPTION_READER,
  SubscriptionReader,
} from '../ports/subscription.repository';

const LIMITED: Record<PlanResource, LimitedResource> = {
  professional: 'professionals',
  location: 'locations',
  booking: 'bookings',
};

@Injectable()
export class CheckPlanLimitUseCase {
  constructor(
    @Inject(SUBSCRIPTION_READER)
    private readonly subscriptions: SubscriptionReader,
    @Inject(PLAN_USAGE_READER) private readonly usage: PlanUsageReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    resource: PlanResource,
  ): Promise<Result<PlanVerdict, DomainError>> {
    const subscription = await this.subscriptions.find();
    if (!subscription) return ok({ governs: false });
    const now = this.clock.now();
    if (resource === 'booking' && !allowsNewBookings(subscription, now)) {
      return err(new SubscriptionEnded());
    }
    const limited = LIMITED[resource];
    const used = await this.count(limited, now);
    const checked = checkLimit(subscription.planId, limited, used);
    return checked.ok ? ok({ governs: true }) : checked;
  }

  private count(resource: LimitedResource, now: Date): Promise<number> {
    if (resource === 'professionals') return this.usage.countProfessionals();
    if (resource === 'locations') return this.usage.countLocations();
    return this.usage.countBookings(monthBounds(now));
  }
}
