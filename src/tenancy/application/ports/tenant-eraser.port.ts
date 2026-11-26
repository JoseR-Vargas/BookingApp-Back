// ===== PUERTO PARA BORRAR UN NEGOCIO =====
// Undoes the creation of a business that did not finish (spec 21): the local
// Mongo has no multi-document transactions, so a failed signup compensates.

/** Removes a business and everything that belongs to it. */
export interface TenantEraser {
  /** Deletes the business and all its scoped documents. Idempotent. */
  erase(tenantId: string): Promise<void>;
}

export const TENANT_ERASER = Symbol('TENANT_ERASER');
