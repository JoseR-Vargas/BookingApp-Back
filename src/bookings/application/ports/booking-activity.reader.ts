import type { OccupiedBooking } from '../../../availability/domain/availability';

/**
 * What the other modules ask `bookings` about its data: which blocks are
 * taken (availability) and whether a professional or a service has bookings
 * (catalog). It is read-only; the adapters of `BookingReadModule` translate it
 * to the ports those modules own. A failure of the store throws.
 */
export interface BookingActivityReader {
  /** Non-cancelled bookings on `date` of any of the professionals, with their slots. */
  findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]>;
  /** Confirmed bookings of the professional dated `today` (YYYY-MM-DD) or later. */
  countUpcomingConfirmedOfProfessional(
    professionalId: string,
    today: string,
  ): Promise<number>;
  /** Whether any booking, of any status or date, points at the professional. */
  hasAnyOfProfessional(professionalId: string): Promise<boolean>;
  /** Confirmed bookings dated `today` or later that include the service (each counts once). */
  countUpcomingConfirmedOfService(
    serviceId: string,
    today: string,
  ): Promise<number>;
  /** Whether any booking, of any status or date, includes the service. */
  hasAnyOfService(serviceId: string): Promise<boolean>;
}

export const BOOKING_ACTIVITY_READER = Symbol('BOOKING_ACTIVITY_READER');
