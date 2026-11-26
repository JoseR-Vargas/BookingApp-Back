// ===== PUERTO: INVALIDAR LA DISPONIBILIDAD =====
// Whatever changes what the availability answers (a booking, a schedule, a
// professional, a service) tells the cache of the business in force to forget
// it (spec 22). The business is the one of the current request: the adapter
// reads it, the callers never name it.

export interface AvailabilityInvalidator {
  /** Forgets every cached answer of the business in force. */
  invalidateBusiness(): void;
}

export const AVAILABILITY_INVALIDATOR = Symbol('AVAILABILITY_INVALIDATOR');
