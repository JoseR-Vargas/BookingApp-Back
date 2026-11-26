// ===== CONTEXTO DE NEGOCIO (ADAPTADOR) =====
// The adapter of the `TenantContext` port: it keeps the business in an
// `AsyncLocalStorage`, so it travels with the promises of the request and the
// background work it starts.

import { Injectable } from '@nestjs/common';
import {
  Tenant,
  TenantContext,
  TenantContextError,
  TenantScope,
} from '../../application/tenant-context.port';
import { tenantScopeStorage } from './tenant-scope.storage';

@Injectable()
export class AsyncLocalStorageTenantContext
  implements TenantContext, TenantScope
{
  current(): Tenant {
    const scope = tenantScopeStorage.getStore();
    if (!scope?.tenantId) {
      throw new TenantContextError(
        'There is no business in the context: the query would read the data of every business.',
      );
    }
    return {
      id: scope.tenantId,
      slug: scope.slug ?? '',
      isDefault: scope.isDefault,
    };
  }

  /**
   * Runs `fn` inside the scope of `tenant`. Everything `fn` starts (its
   * promises, its timers) keeps the business.
   */
  run<T>(tenant: Tenant, fn: () => T): T {
    return tenantScopeStorage.run(
      { tenantId: tenant.id, slug: tenant.slug, isDefault: tenant.isDefault },
      fn,
    );
  }
}
