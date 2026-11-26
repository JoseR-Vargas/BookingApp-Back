// ===== LECTOR DE RESERVAS FUTURAS =====
// The upcoming bookings the schedule impact counts. PROVISIONAL: the bookings
// collection belongs to `bookings`; the port is answered from there when that
// module's read model replaces it (spec 26).

import { ScheduledBooking } from '../../domain/schedule-impact.rules';

export interface UpcomingBookingsReader {
  /**
   * The non-cancelled bookings dated `today` or later, with the fields the
   * impact needs. A failure of the store throws (an infrastructure failure,
   * not a business one).
   */
  findUpcoming(
    today: string,
    scope?: { locationId: string },
  ): Promise<ScheduledBooking[]>;
}

export const UPCOMING_BOOKINGS_READER = Symbol('UPCOMING_BOOKINGS_READER');
