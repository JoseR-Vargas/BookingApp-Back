// ===== PUERTO: CACHÉ DE NEGOCIOS =====
// The business of a request is kept for a minute (spec 18). When the owner
// of the system changes it, the cache must forget it: the change has to be
// seen by the very next request (spec 25).

export interface TenantCacheInvalidator {
  /** Forgets the cached business: its state changed and every request must see it. */
  invalidate(slug: string): void;
}

export const TENANT_CACHE_INVALIDATOR = Symbol('TENANT_CACHE_INVALIDATOR');
