import { PlanStatus } from '../../domain/plan-status';
import { PLANS, PlanId, PlanLimits } from '../../domain/plans';
import { SubscriptionStatus } from '../../domain/subscription';

/** What the API shows of the plan of a business (spec 23). */
export interface PublicPlan {
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  limits: PlanLimits;
  usage: {
    professionals: number;
    locations: number;
    bookingsThisMonth: number;
  };
}

export const toPublicPlan = (plan: PlanStatus): PublicPlan => ({
  planId: plan.planId,
  status: plan.status,
  currentPeriodEnd: plan.currentPeriodEnd.toISOString(),
  cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
  limits: plan.limits,
  usage: plan.usage,
});

/** A plan of the catalog, for the comparison of plans. */
export interface PublicPlanCatalogEntry {
  id: PlanId;
  name: string;
  limits: PlanLimits;
}

/** Every plan, from the smallest to the biggest. */
export const publicPlanCatalog = (): PublicPlanCatalogEntry[] =>
  PLANS.map((plan) => ({ id: plan.id, name: plan.name, limits: plan.limits }));
