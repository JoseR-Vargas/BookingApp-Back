// ===== PUERTO DE NEGOCIOS =====
// Where the businesses are stored. The collection has no `tenantId`: a
// business is not owned by another business.

import { NewTenant, Tenant } from '../../domain/tenant';

/** Reads the businesses. */
export interface TenantReader {
  /** The business with this slug, or null. */
  findBySlug(slug: string): Promise<Tenant | null>;
  /** The business used when the request names none, or null. */
  findDefault(): Promise<Tenant | null>;
}

export const TENANT_READER = Symbol('TENANT_READER');

/** Stores the businesses. */
export interface TenantWriter {
  /** Stores a new business and answers it. */
  insert(tenant: NewTenant): Promise<Tenant>;
}

export const TENANT_WRITER = Symbol('TENANT_WRITER');
