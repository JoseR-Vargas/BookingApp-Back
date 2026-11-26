// Suspending a business of the installation (spec 25). The business stops
// answering requests (its own routes answer 403) and nothing is deleted.

import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { TENANT_CACHE_INVALIDATOR } from '../../../tenancy/application/ports/tenant-cache.port';
import { TenantCacheInvalidator } from '../../../tenancy/application/ports/tenant-cache.port';
import { TENANT_LIFECYCLE_WRITER } from '../../../tenancy/application/ports/tenant-lifecycle.port';
import { TenantLifecycleWriter } from '../../../tenancy/application/ports/tenant-lifecycle.port';
import { PlatformBusiness, findBusiness } from '../../domain/platform-business';
import { PlatformBusinessNotFound } from '../../domain/platform.errors';
import { canSuspendBusiness } from '../../domain/platform.rules';
import { PlatformBusinessReader } from '../platform-business-reader';
import { PLATFORM_AUDIT } from '../ports/platform-audit.port';
import { PlatformAudit } from '../ports/platform-audit.port';

@Injectable()
export class SuspendBusinessUseCase {
  constructor(
    private readonly reader: PlatformBusinessReader,
    @Inject(TENANT_LIFECYCLE_WRITER)
    private readonly writer: TenantLifecycleWriter,
    @Inject(TENANT_CACHE_INVALIDATOR)
    private readonly cache: TenantCacheInvalidator,
    @Inject(PLATFORM_AUDIT) private readonly audit: PlatformAudit,
  ) {}

  async execute(id: string): Promise<Result<PlatformBusiness>> {
    const businesses = await this.reader.list();
    const business = findBusiness(businesses, id);
    if (!business) return err(new PlatformBusinessNotFound());
    const active = businesses.filter((b) => b.status === 'active').length;
    const allowed = canSuspendBusiness(business, active);
    if (!allowed.ok) return err(allowed.error);

    await this.writer.setStatus(business.id, 'suspended');
    // The business of a request is cached for a minute: the change has to be
    // seen by the very next request (its routes must answer 403 at once).
    this.cache.invalidate(business.slug);
    await this.audit.record({
      businessId: business.id,
      action: 'suspend',
      from: 'active',
      to: 'suspended',
      detail: null,
    });
    const updated = findBusiness(await this.reader.list(), business.id);
    return updated ? ok(updated) : err(new PlatformBusinessNotFound());
  }
}
