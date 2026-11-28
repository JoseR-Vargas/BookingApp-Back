// ===== MÓDULO DEL PANEL DEL DUEÑO =====
// Composition root of the owner panel (spec 25): the only place where its
// ports are bound to adapters.
//
// The routes of the owner read across businesses, so they run outside any
// business (the tenancy module exempts them from its middleware) and every
// read they do is an explicit `unscoped` escape. The key that opens them is
// `PLATFORM_API_KEY`, not the admin key of a business.

import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PLATFORM_AUDIT } from './application/ports/platform-audit.port';
import { PLATFORM_CREDENTIALS } from './application/ports/platform-credentials.port';
import { PLATFORM_METRICS_CACHE } from './application/ports/platform-metrics-cache.port';
import { PLATFORM_USAGE_READER } from './application/ports/platform-usage.port';
import { PlatformBusinessReader } from './application/platform-business-reader';
import { ChangePlanUseCase } from './application/use-cases/change-plan.use-case';
import { DeleteBusinessUseCase } from './application/use-cases/delete-business.use-case';
import { ExtendTrialUseCase } from './application/use-cases/extend-trial.use-case';
import { GetBusinessDetailUseCase } from './application/use-cases/get-business-detail.use-case';
import { GetPlatformMetricsUseCase } from './application/use-cases/get-platform-metrics.use-case';
import { ListBusinessesUseCase } from './application/use-cases/list-businesses.use-case';
import { ReactivateBusinessUseCase } from './application/use-cases/reactivate-business.use-case';
import { SuspendBusinessUseCase } from './application/use-cases/suspend-business.use-case';
import { LoggingPlatformAudit } from './infrastructure/audit/logging-platform-audit';
import {
  DEFAULT_PLATFORM_METRICS_CACHE_TTL_SECONDS,
  InMemoryPlatformMetricsCache,
} from './infrastructure/cache/in-memory-platform-metrics.cache';
import { EnvPlatformCredentials } from './infrastructure/credentials/env-platform-credentials';
import { PlatformKeyGuard } from './infrastructure/http/platform-key.guard';
import { PlatformMetricsController } from './infrastructure/http/platform-metrics.controller';
import { PlatformTenantActionsController } from './infrastructure/http/platform-tenant-actions.controller';
import { PlatformTenantsController } from './infrastructure/http/platform-tenants.controller';
import { MongoPlatformUsageReader } from './infrastructure/persistence/mongo/mongo-platform-usage.reader';

/** `PLATFORM_METRICS_CACHE_TTL_SECONDS` overrides the 60 s (`0` turns the cache off). Read at the edge. */
export function platformMetricsCacheTtlMs(
  env: string | undefined = process.env.PLATFORM_METRICS_CACHE_TTL_SECONDS,
): number {
  const seconds = env === undefined || env.trim() === '' ? NaN : Number(env);
  return (
    (Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : DEFAULT_PLATFORM_METRICS_CACHE_TTL_SECONDS) * 1000
  );
}

@Module({
  imports: [
    // The businesses of the installation and the scope they answer in.
    TenancyModule,
    // The subscriptions of every business.
    BillingModule,
  ],
  controllers: [
    PlatformTenantsController,
    PlatformTenantActionsController,
    PlatformMetricsController,
  ],
  providers: [
    { provide: PLATFORM_CREDENTIALS, useClass: EnvPlatformCredentials },
    PlatformKeyGuard,
    { provide: PLATFORM_USAGE_READER, useClass: MongoPlatformUsageReader },
    {
      provide: PLATFORM_METRICS_CACHE,
      useFactory: () =>
        new InMemoryPlatformMetricsCache(
          new SystemClock(),
          platformMetricsCacheTtlMs(),
        ),
    },
    { provide: PLATFORM_AUDIT, useClass: LoggingPlatformAudit },
    { provide: CLOCK, useClass: SystemClock },
    PlatformBusinessReader,
    ListBusinessesUseCase,
    GetBusinessDetailUseCase,
    GetPlatformMetricsUseCase,
    SuspendBusinessUseCase,
    ReactivateBusinessUseCase,
    ExtendTrialUseCase,
    ChangePlanUseCase,
    DeleteBusinessUseCase,
  ],
  exports: [PlatformBusinessReader],
})
export class PlatformModule {}
