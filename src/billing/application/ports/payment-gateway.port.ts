// ===== PUERTO DE PAGO =====
// The payment gateway behind the application: create a payment, verify the
// signature of a webhook and understand its event (spec 23). Which gateway is
// chosen at deploy time (`PAYMENT_GATEWAY`); the code does not depend on it.
import { PaymentEvent } from '../../domain/payment-event';
import { PlanId } from '../../domain/plans';

export interface CheckoutRequest {
  /** Goes to the gateway as metadata and comes back in the webhook events. */
  tenantSlug: string;
  planId: PlanId;
}

export interface Checkout {
  /** The id the gateway gave to the payment. */
  externalPaymentId: string;
  /** Where the owner pays. */
  checkoutUrl: string;
}

export interface PaymentGateway {
  createCheckout(request: CheckoutRequest): Promise<Checkout>;
  /** Whether `signature` proves that `rawBody` came from the gateway. */
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  /** The event of a body whose signature was verified; null when it is not understood. */
  parseEvent(rawBody: string): PaymentEvent | null;
  /** Tells the gateway not to charge the next period. */
  cancelAtPeriodEnd(externalPaymentId: string): Promise<void>;
  /** Tells the gateway to keep charging. */
  resume(externalPaymentId: string): Promise<void>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
