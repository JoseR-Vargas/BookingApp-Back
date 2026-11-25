// ===== CONTEXTO DE NEGOCIO (TENANT) =====
// The business a request belongs to. The domain and the use cases never know
// it: the adapters ask for it through this port and apply it themselves
// (spec 18).

import { DomainError } from '../domain/domain-error';

/** The business a request belongs to. */
export interface Tenant {
  /** The `_id` of the tenant, as a hex string. It is the `tenantId` of the documents. */
  id: string;
  /** The slug the request named (`X-Tenant`), or the default one. */
  slug: string;
}

/**
 * The business in force right now. It THROWS `TenantContextError` when there
 * is none: a query without a business would read every business, so it must
 * fail closed instead of answering "all of them".
 */
export interface TenantContext {
  current(): Tenant;
}

export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');

/**
 * Runs code inside the scope of a business. The HTTP edge opens the scope and
 * the adapters read it; nothing else needs to know how it is stored.
 */
export interface TenantScope {
  run<T>(tenant: Tenant, fn: () => T): T;
}

export const TENANT_SCOPE = Symbol('TENANT_SCOPE');

/**
 * There is no business in the context, or the query names another one.
 *
 * It is a `DomainError` of the new kind `tenant`, so the one filter of the
 * project answers it as a 500: a missing business is a fault of the server,
 * never a business failure of the request.
 */
export class TenantContextError extends DomainError {
  constructor(message: string) {
    super('tenant', message);
  }
}
