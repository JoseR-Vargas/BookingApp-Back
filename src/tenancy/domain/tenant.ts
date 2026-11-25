// ===== NEGOCIO (TENANT) =====
// The business a document belongs to. The domain of the other modules never
// knows it (spec 18): only the adapters of the persistence ask for it.

/** Whether the business answers requests. */
export type TenantStatus = 'active' | 'suspended';

/** A business of the installation. */
export interface Tenant {
  /** The `_id` of the business, as a hex string. It is the `tenantId` of its documents. */
  id: string;
  /** The unique, immutable name of the business in a URL (`X-Tenant`). */
  slug: string;
  /** The name the business shows. */
  name: string;
  /** Whether the business answers requests. */
  status: TenantStatus;
  /** Whether the business is the one used when the request names none. */
  isDefault: boolean;
  /** When the business was created. */
  createdAt: Date;
}

/** A business that does not exist yet. */
export interface NewTenant {
  slug: string;
  name: string;
  status: TenantStatus;
  isDefault: boolean;
  createdAt: Date;
}
