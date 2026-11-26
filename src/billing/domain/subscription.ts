// ===== SUSCRIPCIÓN =====
import { PlanId } from './plans';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** The subscription of the business in force (one per business). */
export interface Subscription {
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  /** The id the payment gateway gave to the payment; null when none. */
  externalPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
