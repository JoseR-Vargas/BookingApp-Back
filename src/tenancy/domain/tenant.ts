// ===== NEGOCIO (TENANT) =====
// The business a document belongs to. The domain of the other modules never
// knows it (spec 18): only the adapters of the persistence ask for it.

import { ReminderSettings } from '../../shared/domain/reminders';

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
  /** When the free trial ends; null means "no trial" (spec 21). */
  trialEndsAt: Date | null;
  /** How many bookings the trial allows; null means "no limit" (spec 21). */
  bookingQuota: number | null;
  /** The cap of data in bytes; null means "no cap" (spec 22). */
  storageQuotaBytes: number | null;
  /** The size of its documents at the last measurement (0 when never measured). */
  storageUsedBytes: number;
  /** When the size was last measured; null when never. */
  storageMeasuredAt: Date | null;
  /** How the business wants its reminders (spec 24); absent means "the defaults". */
  reminders?: ReminderSettings;
}

/** A business that does not exist yet. */
export interface NewTenant {
  slug: string;
  name: string;
  status: TenantStatus;
  isDefault: boolean;
  createdAt: Date;
  trialEndsAt: Date | null;
  bookingQuota: number | null;
  storageQuotaBytes: number | null;
  storageUsedBytes: number;
  storageMeasuredAt: Date | null;
}
