// The metrics of the installation (spec 25). They are cached for a minute:
// the free tier of Atlas allows 100 operations per second and the owner
// visits the panel often.

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, ok } from '../../../shared/domain/result';
import { dayPeriod } from '../../domain/period.rules';
import { PlatformMetrics } from '../../domain/platform-metrics';
import { revenueByPlan } from '../../domain/platform-metrics.rules';
import { PlatformBusinessReader } from '../platform-business-reader';
import {
  CachedMetrics,
  PLATFORM_METRICS_CACHE,
  PlatformMetricsCache,
} from '../ports/platform-metrics-cache.port';
import { PLATFORM_USAGE_READER } from '../ports/platform-usage.port';
import { PlatformUsageReader } from '../ports/platform-usage.port';

@Injectable()
export class GetPlatformMetricsUseCase {
  constructor(
    private readonly reader: PlatformBusinessReader,
    @Inject(PLATFORM_USAGE_READER) private readonly usage: PlatformUsageReader,
    @Inject(PLATFORM_METRICS_CACHE)
    private readonly cache: PlatformMetricsCache,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<CachedMetrics>> {
    const cached = this.cache.get();
    if (cached) return ok(cached);
    const now = this.clock.now();
    const businesses = await this.reader.list();
    const today = await this.usage.usage(dayPeriod(now));
    const metrics: PlatformMetrics = {
      businesses: {
        total: businesses.length,
        active: businesses.filter((b) => b.status === 'active').length,
        suspended: businesses.filter((b) => b.status === 'suspended').length,
        inTrial: businesses.filter(
          (b) => b.trial !== null && b.trial.daysLeft > 0,
        ).length,
      },
      bookings: {
        today: [...today.bookingsByBusiness.values()].reduce(
          (total, count) => total + count,
          0,
        ),
        thisMonth: businesses.reduce(
          (total, business) => total + business.bookingsThisMonth,
          0,
        ),
      },
      estimatedRevenueByPlan: revenueByPlan(businesses),
      generatedAt: now,
    };
    return ok(this.cache.set(metrics));
  }
}
