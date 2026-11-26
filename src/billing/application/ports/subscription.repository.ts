// ===== PUERTOS: SUSCRIPCIÓN =====
// One subscription per business: the adapter reads and writes the one of the
// business in force (tenant scope).
import { Subscription } from '../../domain/subscription';

export interface SubscriptionReader {
  /** The subscription of the business in force, or null when it has none. */
  find(): Promise<Subscription | null>;
}

export interface SubscriptionWriter {
  /** Creates or replaces the subscription of the business in force. */
  save(subscription: Subscription): Promise<void>;
}

export const SUBSCRIPTION_READER = Symbol('SUBSCRIPTION_READER');
export const SUBSCRIPTION_WRITER = Symbol('SUBSCRIPTION_WRITER');
