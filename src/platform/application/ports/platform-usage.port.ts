// ===== PUERTO: USO DE LOS NEGOCIOS =====
// What every business of the installation did, read across businesses (the
// owner of the system, spec 25). Only counts and dates: never the data of a
// client.

import { Period } from '../../domain/period.rules';
import {
  PlatformBreakdown,
  PlatformCatalogSize,
  PlatformUsage,
} from '../../domain/platform-usage';

export interface PlatformUsageReader {
  /** The bookings of every business in the period, and when each one was used the last time. */
  usage(period: Period): Promise<PlatformUsage>;
  /** The bookings of one business in the period, broken down by professional, service and location. */
  breakdown(tenantId: string, period: Period): Promise<PlatformBreakdown>;
  /** How many professionals, services and locations the business has. */
  catalogSize(tenantId: string): Promise<PlatformCatalogSize>;
}

export const PLATFORM_USAGE_READER = Symbol('PLATFORM_USAGE_READER');
