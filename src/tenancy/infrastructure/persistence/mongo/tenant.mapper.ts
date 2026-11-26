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
    trialEndsAt: record.trialEndsAt ?? null,
    bookingQuota: record.bookingQuota ?? null,
    storageQuotaBytes: record.storageQuotaBytes ?? null,
    storageUsedBytes: record.storageUsedBytes ?? 0,
    storageMeasuredAt: record.storageMeasuredAt ?? null,
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
    trialEndsAt: tenant.trialEndsAt,
    bookingQuota: tenant.bookingQuota,
    storageQuotaBytes: tenant.storageQuotaBytes,
    storageUsedBytes: tenant.storageUsedBytes,
    storageMeasuredAt: tenant.storageMeasuredAt,
  };
}
