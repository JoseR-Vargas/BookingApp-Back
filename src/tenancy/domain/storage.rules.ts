// ===== REGLAS DE LA CUOTA DE ALMACENAMIENTO =====
// A business created by the signup gets a cap of data (spec 22): the free
// Atlas tier has 0.5 GB for everybody. Pure: the measure and the clock come in.

import { Tenant } from './tenant';

/** The cap a business created by the signup gets: 50 MB. */
export const DEFAULT_STORAGE_QUOTA_BYTES = 50 * 1024 * 1024;

/** A measurement is reused for this long, to spend few operations of the database. */
export const STORAGE_MEASUREMENT_TTL_MS = 10 * 60_000;

const WARNING_PERCENT = 70;
const CRITICAL_PERCENT = 90;

/** How close to the cap a business is. `blocked` refuses new bookings and photos. */
export type StorageLevel = 'ok' | 'warning' | 'critical' | 'blocked';

export interface StorageStatus {
  usedBytes: number;
  quotaBytes: number;
  /** Whole percent (rounded down); may pass 100. */
  percent: number;
  level: StorageLevel;
}

/** The level of `usedBytes` against `quotaBytes`, judged on the exact ratio. */
export function storageLevelOf(
  usedBytes: number,
  quotaBytes: number,
): StorageLevel {
  if (usedBytes * 100 >= quotaBytes * 100) return 'blocked';
  if (usedBytes * 100 >= quotaBytes * CRITICAL_PERCENT) return 'critical';
  if (usedBytes * 100 >= quotaBytes * WARNING_PERCENT) return 'warning';
  return 'ok';
}

/** The state of the storage of a business, or null when it has no cap. */
export function storageStatusOf(
  tenant: Pick<Tenant, 'storageQuotaBytes' | 'storageUsedBytes'>,
): StorageStatus | null {
  const { storageQuotaBytes: quota, storageUsedBytes: used } = tenant;
  if (quota === null) return null;
  return {
    usedBytes: used,
    quotaBytes: quota,
    percent: quota > 0 ? Math.floor((used * 100) / quota) : 100,
    level: storageLevelOf(used, quota),
  };
}

/** Whether the last measurement is too old (or was never made, or is from the future). */
export function isMeasurementStale(
  measuredAt: Date | null,
  now: Date,
): boolean {
  if (measuredAt === null) return true;
  const age = now.getTime() - measuredAt.getTime();
  return age < 0 || age >= STORAGE_MEASUREMENT_TTL_MS;
}
