// Deleting a business of the installation (the owner of the system asked for
// the real deletion). Everything of the business goes: its bookings, the data
// of its clients, its catalog, its users and its subscription. The events of
// the payments stay (they are the audit trail of the installation).
//
// Two things are never deleted: the business that answers when the request
// names none, and the last business that answers. The deletion must be
// confirmed with the slug of the business.

import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { TENANT_CACHE_INVALIDATOR } from '../../../tenancy/application/ports/tenant-cache.port';
import { TenantCacheInvalidator } from '../../../tenancy/application/ports/tenant-cache.port';
import { TENANT_ERASER } from '../../../tenancy/application/ports/tenant-eraser.port';
import { TenantEraser } from '../../../tenancy/application/ports/tenant-eraser.port';
import { findBusiness } from '../../domain/platform-business';
import { PlatformBusinessNotFound } from '../../domain/platform.errors';
import { canDeleteBusiness } from '../../domain/platform.rules';
import { PlatformBusinessReader } from '../platform-business-reader';
import { PLATFORM_AUDIT } from '../ports/platform-audit.port';
import { PlatformAudit } from '../ports/platform-audit.port';

@Injectable()
export class DeleteBusinessUseCase {
  constructor(
    private readonly reader: PlatformBusinessReader,
    @Inject(TENANT_ERASER) private readonly eraser: TenantEraser,
    @Inject(TENANT_CACHE_INVALIDATOR)
    private readonly cache: TenantCacheInvalidator,
    @Inject(PLATFORM_AUDIT) private readonly audit: PlatformAudit,
  ) {}

  async execute(
    id: string,
    confirmation: unknown,
  ): Promise<Result<{ id: string; slug: string; name: string }>> {
    const businesses = await this.reader.list();
    const business = findBusiness(businesses, id);
    if (!business) return err(new PlatformBusinessNotFound());
    const active = businesses.filter((b) => b.status === 'active').length;
    const allowed = canDeleteBusiness(business, active, confirmation);
    if (!allowed.ok) return err(allowed.error);

    await this.eraser.erase(business.id);
    // The business of a request is cached for a minute: the change has to be
    // seen by the very next request (its routes must answer 404 at once).
    this.cache.invalidate(business.slug);
    await this.audit.record({
      businessId: business.id,
      action: 'delete',
      from: business.status,
      to: 'deleted',
      detail: `el negocio "${business.slug}" y todos sus datos fueron eliminados`,
    });
    return ok({ id: business.id, slug: business.slug, name: business.name });
  }
}
