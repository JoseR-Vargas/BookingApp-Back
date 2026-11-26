// Reactivating a business of the installation (spec 25): it answers requests
// again. If its trial had expired, the trial starts again today, which is
// what lets the owner extend it afterwards.

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { TENANT_CACHE_INVALIDATOR } from '../../../tenancy/application/ports/tenant-cache.port';
import { TenantCacheInvalidator } from '../../../tenancy/application/ports/tenant-cache.port';
import { TENANT_LIFECYCLE_WRITER } from '../../../tenancy/application/ports/tenant-lifecycle.port';
import { TenantLifecycleWriter } from '../../../tenancy/application/ports/tenant-lifecycle.port';
import { PlatformBusiness, findBusiness } from '../../domain/platform-business';
import { PlatformBusinessNotFound } from '../../domain/platform.errors';
import { canReactivateBusiness } from '../../domain/platform.rules';
import { PlatformBusinessReader } from '../platform-business-reader';
import { PLATFORM_AUDIT } from '../ports/platform-audit.port';
import { PlatformAudit } from '../ports/platform-audit.port';

@Injectable()
export class ReactivateBusinessUseCase {
  constructor(
    private readonly reader: PlatformBusinessReader,
    @Inject(TENANT_LIFECYCLE_WRITER)
    private readonly writer: TenantLifecycleWriter,
    @Inject(TENANT_CACHE_INVALIDATOR)
    private readonly cache: TenantCacheInvalidator,
    @Inject(PLATFORM_AUDIT) private readonly audit: PlatformAudit,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<Result<PlatformBusiness>> {
    const now = this.clock.now();
    const business = findBusiness(await this.reader.list(), id);
    if (!business) return err(new PlatformBusinessNotFound());
    const outcome = canReactivateBusiness(
      {
        status: business.status,
        trialEndsAt: business.trial ? business.trial.endsAt : null,
      },
      now,
    );
    if (!outcome.ok) return err(outcome.error);

    if (outcome.value.statusChanged) {
      await this.writer.setStatus(business.id, 'active');
    }
    if (outcome.value.trialEndsAt) {
      await this.writer.setTrialEndsAt(business.id, outcome.value.trialEndsAt);
    }
    this.cache.invalidate(business.slug);
    await this.audit.record({
      businessId: business.id,
      action: 'reactivate',
      from: business.status,
      to: 'active',
      detail: outcome.value.trialEndsAt
        ? 'la prueba vencida vuelve a empezar hoy'
        : null,
    });
    const updated = findBusiness(await this.reader.list(), business.id);
    return updated ? ok(updated) : err(new PlatformBusinessNotFound());
  }
}
