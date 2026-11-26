import { Global, Module } from '@nestjs/common';
import { CLOCK } from '../../../shared/application/clock.port';
import { AVAILABILITY_INVALIDATOR } from '../../../shared/application/availability-invalidator.port';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../../shared/application/tenant-context.port';
import { SystemClock } from '../../../shared/infrastructure/system.clock';
import { TenancyModule } from '../../../tenancy/tenancy.module';
import { AVAILABILITY_CACHE } from '../../application/ports/availability-cache.port';
import {
  DEFAULT_AVAILABILITY_CACHE_TTL_SECONDS,
  InMemoryAvailabilityCache,
} from './in-memory-availability.cache';

/** `AVAILABILITY_CACHE_TTL_SECONDS` overrides the 60 s (`0` turns the cache off). Read at the edge. */
export function availabilityCacheTtlMs(
  env: string | undefined = process.env.AVAILABILITY_CACHE_TTL_SECONDS,
): number {
  const seconds = env === undefined || env.trim() === '' ? NaN : Number(env);
  return (
    (Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : DEFAULT_AVAILABILITY_CACHE_TTL_SECONDS) * 1000
  );
}

/**
 * One cache for the process. Global because the modules that change what the
 * availability answers (bookings, catalog) only need to invalidate it.
 */
@Global()
@Module({
  imports: [TenancyModule],
  providers: [
    {
      provide: AVAILABILITY_CACHE,
      useFactory: (context: TenantContext) =>
        new InMemoryAvailabilityCache(
          new SystemClock(),
          context,
          availabilityCacheTtlMs(),
        ),
      inject: [TENANT_CONTEXT],
    },
    { provide: AVAILABILITY_INVALIDATOR, useExisting: AVAILABILITY_CACHE },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [AVAILABILITY_CACHE, AVAILABILITY_INVALIDATOR],
})
export class AvailabilityCacheModule {}
