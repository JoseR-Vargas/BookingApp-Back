// ===== CONTEXTO DEL NEGOCIO POR DEFECTO =====
// The work that is not part of a request of a business: the startup
// migration, the seeders and the WhatsApp bot. They always run in the
// default business (spec 18).

import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../../shared/application/tenant-context.port';
import { TenantService } from '../application/tenant.service';

@Injectable()
export class DefaultTenantScope {
  constructor(
    private readonly tenants: TenantService,
    @Inject(TENANT_SCOPE) private readonly scope: TenantScope,
  ) {}

  /** Runs `fn` inside the scope of the default business. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const resolved = await this.tenants.resolveDefault();
    if (!resolved.ok) {
      throw resolved.error;
    }
    const tenant = resolved.value;
    return this.scope.run({ id: tenant.id, slug: tenant.slug }, fn);
  }
}
