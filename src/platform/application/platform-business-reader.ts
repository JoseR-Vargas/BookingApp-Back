// ===== LECTOR DE NEGOCIOS DEL PANEL =====
// The signals of every business of the installation, read across businesses
// (spec 25). It joins the businesses, their subscriptions and their usage;
// it never reads the data of a client.

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../shared/application/clock.port';
import { TENANT_DIRECTORY } from '../../tenancy/application/ports/tenant-directory.port';
import { TenantDirectory } from '../../tenancy/application/ports/tenant-directory.port';
import { SUBSCRIPTION_DIRECTORY } from '../../billing/application/ports/subscription-directory.port';
import { SubscriptionDirectory } from '../../billing/application/ports/subscription-directory.port';
import { effectiveStatus } from '../../billing/domain/subscription.rules';
import { monthPeriod } from '../domain/period.rules';
import {
  PlatformBusiness,
  toPlatformBusiness,
} from '../domain/platform-business';
import { PLATFORM_USAGE_READER } from './ports/platform-usage.port';
import { PlatformUsageReader } from './ports/platform-usage.port';

@Injectable()
export class PlatformBusinessReader {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    @Inject(SUBSCRIPTION_DIRECTORY)
    private readonly subscriptions: SubscriptionDirectory,
    @Inject(PLATFORM_USAGE_READER) private readonly usage: PlatformUsageReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Every business of the installation, with its signals. */
  async list(): Promise<PlatformBusiness[]> {
    const now = this.clock.now();
    const [tenants, subscriptions, usage] = await Promise.all([
      this.tenants.list(),
      this.subscriptions.list(),
      this.usage.usage(monthPeriod(now)),
    ]);
    const byTenant = new Map(
      subscriptions.map((entry) => [entry.tenantId, entry.subscription]),
    );
    return tenants.map((tenant) => {
      const subscription = byTenant.get(tenant.id);
      return toPlatformBusiness(
        {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          trialEndsAt: tenant.trialEndsAt,
          planId: subscription?.planId ?? null,
          subscriptionStatus: subscription
            ? effectiveStatus(subscription, now)
            : null,
          bookingsThisMonth: usage.bookingsByBusiness.get(tenant.id) ?? 0,
          storageUsedBytes: tenant.storageUsedBytes,
          storageQuotaBytes: tenant.storageQuotaBytes,
          lastUseAt: usage.lastUseByBusiness.get(tenant.id) ?? null,
        },
        now,
      );
    });
  }
}
