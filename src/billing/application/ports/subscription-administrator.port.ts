// ===== PUERTO: ADMINISTRACIÓN DE SUSCRIPCIONES =====
// A manual change of the plan, made by the owner of the system without the
// payment gateway (spec 25). It is not a payment: it never asks the gateway
// and it never charges anybody.

import { PlanId } from '../../domain/plans';

/** What a manual change of the plan did. */
export interface ManualPlanChange {
  /** The plan before the change; null when the business had no subscription. */
  previousPlanId: PlanId | null;
  /** The plan after the change. */
  planId: PlanId;
}

export interface SubscriptionAdministrator {
  /** Applies a manual change of the plan of a business and answers what changed. */
  changePlan(
    tenantId: string,
    planId: PlanId,
    now: Date,
  ): Promise<ManualPlanChange>;
}

export const SUBSCRIPTION_ADMINISTRATOR = Symbol('SUBSCRIPTION_ADMINISTRATOR');
