// ===== ESTADO DEL PLAN =====
// What the panel shows of the plan of a business: the plan, its state, its
// limits and what the business has used (spec 23).
import { PlanLimits, planById, PlanId } from './plans';
import { effectiveStatus } from './subscription.rules';
import { Subscription, SubscriptionStatus } from './subscription';

/** How much of each limited thing the business uses. */
export interface PlanUsage {
  professionals: number;
  locations: number;
  /** Bookings created in the current calendar month (UTC). */
  bookingsThisMonth: number;
}

export interface PlanStatus {
  planId: PlanId;
  /** A canceled-at-period-end subscription whose period passed reads `canceled`. */
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  limits: PlanLimits;
  usage: PlanUsage;
}

export function planStatusOf(
  subscription: Subscription,
  usage: PlanUsage,
  now: Date,
): PlanStatus {
  return {
    planId: subscription.planId,
    status: effectiveStatus(subscription, now),
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    limits: planById(subscription.planId).limits,
    usage,
  };
}
