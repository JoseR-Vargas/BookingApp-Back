// ===== PUERTO: DIRECTORIO DE SUSCRIPCIONES =====
// The subscription of every business of the installation. The owner of the
// system sees them all (spec 25); a business only ever sees its own.

import { Subscription } from '../../domain/subscription';

/** The subscription of a business of the installation. */
export interface SubscriptionOfBusiness {
  /** The id of the business that pays. */
  tenantId: string;
  /** Its subscription. */
  subscription: Subscription;
}

export interface SubscriptionDirectory {
  /** The subscription of every business that has one. */
  list(): Promise<SubscriptionOfBusiness[]>;
}

export const SUBSCRIPTION_DIRECTORY = Symbol('SUBSCRIPTION_DIRECTORY');
