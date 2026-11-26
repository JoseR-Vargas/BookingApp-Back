// The detail of one business of the installation (spec 25): the same signals
// as the list plus the breakdown of its bookings by professional, service and
// location. Counts only.

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { monthPeriod } from '../../domain/period.rules';
import {
  PlatformBusinessDetail,
  findBusiness,
} from '../../domain/platform-business';
import { PlatformBusinessNotFound } from '../../domain/platform.errors';
import { PlatformBusinessReader } from '../platform-business-reader';
import { PLATFORM_USAGE_READER } from '../ports/platform-usage.port';
import { PlatformUsageReader } from '../ports/platform-usage.port';

@Injectable()
export class GetBusinessDetailUseCase {
  constructor(
    private readonly reader: PlatformBusinessReader,
    @Inject(PLATFORM_USAGE_READER) private readonly usage: PlatformUsageReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<Result<PlatformBusinessDetail>> {
    const now = this.clock.now();
    const business = findBusiness(await this.reader.list(), id);
    if (!business) return err(new PlatformBusinessNotFound());
    const period = monthPeriod(now);
    const [breakdown, catalog] = await Promise.all([
      this.usage.breakdown(business.id, period),
      this.usage.catalogSize(business.id),
    ]);
    return ok({ business, breakdown: { ...breakdown, catalog } });
  }
}
