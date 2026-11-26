import { NewTenant, Tenant } from '../../../domain/tenant';
import {
  DEFAULT_REMINDER_HOURS_BEFORE,
  DEFAULT_REMINDER_TEMPLATE,
  ReminderSettings,
} from '../../../../shared/domain/reminders';
import { TenantRecord } from './tenant.entity';

/** The reminder settings of a stored business, or the defaults when it has none. */
export function toReminderSettings(record: TenantRecord): ReminderSettings {
  const reminders = record.reminders;
  if (!reminders) {
    return {
      enabled: true,
      channels: ['whatsapp', 'email'],
      hoursBefore: [...DEFAULT_REMINDER_HOURS_BEFORE],
      template: DEFAULT_REMINDER_TEMPLATE,
    };
  }
  return {
    enabled: reminders.enabled ?? true,
    channels: reminders.channels ?? ['whatsapp', 'email'],
    hoursBefore: reminders.hoursBefore ?? [...DEFAULT_REMINDER_HOURS_BEFORE],
    template: reminders.template ?? DEFAULT_REMINDER_TEMPLATE,
  };
}

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
    reminders: toReminderSettings(record),
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
