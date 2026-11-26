// ===== PUERTO: MEDIDOR DE ALMACENAMIENTO =====
// How many bytes the documents of a business take (spec 22).

export interface TenantStorageMeter {
  /**
   * The sum of the sizes of the documents of the business in every scoped
   * collection. Indexes are NOT counted: the database does not report them per
   * business (see docs/atlas-limits.md).
   */
  measure(tenantId: string): Promise<number>;
}

export const TENANT_STORAGE_METER = Symbol('TENANT_STORAGE_METER');
