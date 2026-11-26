// ===== EVENTO DE LA PASARELA =====
// What the application understands of a gateway event, whatever the gateway.
import { PlanId } from './plans';

export const PAYMENT_EVENT_TYPES = [
  'payment.succeeded',
  'payment.failed',
  'subscription.trial_started',
  'subscription.canceled',
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export interface PaymentEvent {
  /** The id of the event at the gateway: the key of idempotency. */
  id: string;
  /** Kept as received; an unknown type is acknowledged and ignored. */
  type: string;
  /** The business the payment belongs to (set when the checkout was created). */
  tenantSlug: string;
  planId: PlanId | null;
  externalPaymentId: string | null;
  /** End of the paid period, when the gateway says it. */
  currentPeriodEnd: Date | null;
}
