// The metrics of the installation (spec 25): the numbers the owner of the
// system watches. They are cached for a minute, so they are computed once
// and read many times.

import { PlanId } from '../../billing/domain/plans';

/** How many businesses the installation has. */
export interface PlatformBusinessCount {
  /** Every business of the installation. */
  total: number;
  /** The businesses that answer requests. */
  active: number;
  /** The businesses whose trial is still running. */
  inTrial: number;
  /** The businesses that do not answer requests. */
  suspended: number;
}

/** The bookings of the installation. */
export interface PlatformBookingCount {
  /** The bookings created today (UTC). */
  today: number;
  /** The bookings created in the current month (UTC). */
  thisMonth: number;
}

/** The subscriptions of a plan: an estimate, never a real charge. */
export interface PlatformPlanRevenue {
  planId: PlanId;
  /** How many active subscriptions the plan has. */
  subscriptions: number;
}

/** The metrics of the installation. */
export interface PlatformMetrics {
  businesses: PlatformBusinessCount;
  bookings: PlatformBookingCount;
  /** The active subscriptions of each plan: an estimate, not a charge. */
  estimatedRevenueByPlan: PlatformPlanRevenue[];
  /** When the metrics were computed. */
  generatedAt: Date;
}
