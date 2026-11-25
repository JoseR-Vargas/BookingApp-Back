import { NewTenant, Tenant } from '../../../domain/tenant';
import { TenantRecord } from './tenant.entity';

/** The document of the `tenants` collection as the domain knows it. */
export function toTenant(record: TenantRecord): Tenant {
  return {
    id: String(record._id as unknown as string),
    slug: record.slug,
    name: record.name,
    status: record.status,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
  };
}

/** A new business as the document of the `tenants` collection. */
export function toNewTenantRecord(
  tenant: NewTenant,
): Omit<TenantRecord, '_id'> {
  return {
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    isDefault: tenant.isDefault,
    createdAt: tenant.createdAt,
  };
}
