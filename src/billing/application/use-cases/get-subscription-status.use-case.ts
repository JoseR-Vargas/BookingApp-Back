// ===== CASO DE USO: ESTADO DEL PLAN =====
// The plan of the business in force, its limits and what it used; null when it
// has no subscription (it then behaves as before spec 23).
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, ok } from '../../../shared/domain/result';
import { monthBounds } from '../../domain/limits.rules';
import { PlanStatus, planStatusOf } from '../../domain/plan-status';
import { PLAN_USAGE_READER, PlanUsageReader } from '../ports/plan-usage.reader';
import {
  SUBSCRIPTION_READER,
  SubscriptionReader,
} from '../ports/subscription.repository';

@Injectable()
export class GetSubscriptionStatusUseCase {
  constructor(
    @Inject(SUBSCRIPTION_READER)
    private readonly subscriptions: SubscriptionReader,
    @Inject(PLAN_USAGE_READER) private readonly usage: PlanUsageReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<PlanStatus | null>> {
    const subscription = await this.subscriptions.find();
    if (!subscription) return ok(null);
    const now = this.clock.now();
    const [professionals, locations, bookingsThisMonth] = await Promise.all([
      this.usage.countProfessionals(),
      this.usage.countLocations(),
      this.usage.countBookings(monthBounds(now)),
    ]);
    return ok(
      planStatusOf(
        subscription,
        { professionals, locations, bookingsThisMonth },
        now,
      ),
    );
  }
}
