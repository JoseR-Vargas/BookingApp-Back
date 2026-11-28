// What the owner of the system sees of a business (spec 25): the signals of
// the business, never the data of its clients. Pure data and a builder that
// puts the pieces together.

import { PlanId, planById } from '../../billing/domain/plans';
import { SubscriptionStatus } from '../../billing/domain/subscription';
import { daysLeft } from './period.rules';
import {
  BreakdownEntry,
  PlatformBreakdown,
  PlatformCatalogSize,
} from './platform-usage';

/** The plan of a business, as the panel shows it. */
export interface PlatformPlan {
  id: PlanId;
  name: string;
}

/** The trial of a business, as the panel shows it. */
export interface PlatformTrial {
  /** When the trial ends (ISO in the API). */
  endsAt: Date;
  /** Whole days left, rounded up; 0 once the time is over. */
  daysLeft: number;
}

/** The size of the data of a business. */
export interface PlatformStorage {
  /** Bytes used at the last measurement (0 when it was never measured). */
  usedBytes: number;
  /** The cap in bytes; null means "no cap". */
  quotaBytes: number | null;
}

/** A business of the installation, as the panel sees it. */
export interface PlatformBusiness {
  /** The id of the business (the `_id` of its document). */
  id: string;
  /** The unique name of the business in a URL. */
  slug: string;
  /** Whether it is the business that answers when the request names none. */
  isDefault: boolean;
  /** The name the business shows. */
  name: string;
  /** Whether the business answers requests. */
  status: 'active' | 'suspended';
  /** The plan it pays; null when it has no subscription. */
  plan: PlatformPlan | null;
  /** The state of its subscription; null when it has no subscription. */
  subscriptionStatus: SubscriptionStatus | null;
  /** Its free trial; null when it has none. */
  trial: PlatformTrial | null;
  /** The bookings it created in the current month. */
  bookingsThisMonth: number;
  /** The size of its data. */
  storage: PlatformStorage;
  /** When it was used the last time; null when it never was. */
  lastUseAt: Date | null;
}

/** The business of the panel with its breakdown of the current month. */
export interface PlatformBusinessDetail {
  business: PlatformBusiness;
  breakdown: PlatformBreakdown & { catalog: PlatformCatalogSize };
}

/** The pieces the panel reads and the builder that joins them. */
export interface BusinessSignals {
  id: string;
  slug: string;
  name: string;
  /** Whether it is the business that answers when the request names none. */
  isDefault: boolean;
  status: 'active' | 'suspended';
  /** When the trial ends; null when the business has no trial. */
  trialEndsAt: Date | null;
  /** The plan it pays; null when it has no subscription. */
  planId: PlanId | null;
  /** The state of its subscription; null when it has no subscription. */
  subscriptionStatus: SubscriptionStatus | null;
  /** The bookings it created in the current month. */
  bookingsThisMonth: number;
  /** Bytes used at the last measurement. */
  storageUsedBytes: number;
  /** The cap of data in bytes; null means "no cap". */
  storageQuotaBytes: number | null;
  /** When it was used the last time; null when it never was. */
  lastUseAt: Date | null;
}

/** The business of the panel, with its signals and the days of its trial. */
export function toPlatformBusiness(
  signals: BusinessSignals,
  now: Date,
): PlatformBusiness {
  const left = daysLeft(signals.trialEndsAt, now);
  return {
    id: signals.id,
    slug: signals.slug,
    isDefault: signals.isDefault,
    name: signals.name,
    status: signals.status,
    plan: signals.planId
      ? { id: signals.planId, name: planById(signals.planId).name }
      : null,
    subscriptionStatus: signals.subscriptionStatus,
    trial:
      signals.trialEndsAt !== null && left !== null
        ? { endsAt: signals.trialEndsAt, daysLeft: left }
        : null,
    bookingsThisMonth: signals.bookingsThisMonth,
    storage: {
      usedBytes: signals.storageUsedBytes,
      quotaBytes: signals.storageQuotaBytes,
    },
    lastUseAt: signals.lastUseAt,
  };
}

/** The empty breakdown of a business without bookings. */
export const emptyBreakdown = (): PlatformBreakdown => ({
  professionals: [] as BreakdownEntry[],
  services: [] as BreakdownEntry[],
  locations: [] as BreakdownEntry[],
});

/** The business of this id, or null when the installation has none. */
export function findBusiness(
  businesses: PlatformBusiness[],
  id: string,
): PlatformBusiness | null {
  const wanted = id.trim().toLowerCase();
  return businesses.find((b) => b.id.toLowerCase() === wanted) ?? null;
}
