// The rules of the metrics of the installation (spec 25): how the numbers the
// owner watches are counted. Pure: the businesses come in, the metrics come
// out.

import { PLANS } from '../../billing/domain/plans';
import { PlatformBusiness } from './platform-business';
import { PlatformPlanRevenue } from './platform-metrics';

/**
 * The active subscriptions of each plan: an estimate of what the installation
 * earns, never a real charge (the gateway charges, spec 23). Only the plans
 * with at least one active subscription are listed, in the order of the
 * catalog of plans.
 */
export function revenueByPlan(
  businesses: PlatformBusiness[],
): PlatformPlanRevenue[] {
  const counts = new Map<string, number>();
  for (const business of businesses) {
    if (business.subscriptionStatus !== 'active' || !business.plan) continue;
    counts.set(business.plan.id, (counts.get(business.plan.id) ?? 0) + 1);
  }
  return PLANS.filter((plan) => counts.has(plan.id)).map((plan) => ({
    planId: plan.id,
    subscriptions: counts.get(plan.id) ?? 0,
  }));
}
