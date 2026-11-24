/**
 * What the catalog needs to know about bookings, without knowing where they
 * live. TEMPORARY: it is answered from the bookings collection until the
 * `bookings` module is migrated (spec 13), which will answer it itself.
 */
export interface BookingActivity {
  /** Confirmed bookings of the professional dated `today` (YYYY-MM-DD) or later. */
  countUpcomingConfirmed(
    professionalId: string,
    today: string,
  ): Promise<number>;
  /** Whether any booking, of any status or date, points at the professional. */
  hasAny(professionalId: string): Promise<boolean>;
  /** Confirmed bookings dated `today` or later that include the service (each counts once). */
  countUpcomingConfirmedForService(
    serviceId: string,
    today: string,
  ): Promise<number>;
  /** Whether any booking, of any status or date, includes the service. */
  hasAnyForService(serviceId: string): Promise<boolean>;
}

export const BOOKING_ACTIVITY = Symbol('BOOKING_ACTIVITY');
