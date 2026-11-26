// ===== PUERTO: PUERTA DE LA PRUEBA =====
// Whether the business in force may still accept new bookings. A business on
// a free trial stops accepting them when the time is over or the quota is
// reached (spec 21). The rule lives elsewhere; bookings only ask.

export interface TrialGate {
  /** True when the business accepts new bookings. */
  allowsNewBookings(): Promise<boolean>;
}

export const TRIAL_GATE = Symbol('TRIAL_GATE');
