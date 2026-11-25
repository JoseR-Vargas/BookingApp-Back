import type { Booking } from '../../domain/booking';

/**
 * Tells the outside world about a booking (the admin panel, the client, the
 * admin's WhatsApp). BEST EFFORT: it never rejects, so a notification that
 * fails can never fail the booking or the cancellation that triggers it.
 */
export interface BookingNotifier {
  /** A booking was created; `cancelToken` is the one-time secret for the client's email. */
  created(booking: Booking, cancelToken: string): Promise<void>;
  /** A booking was cancelled through its token. */
  cancelled(booking: Booking): Promise<void>;
}

export const BOOKING_NOTIFIER = Symbol('BOOKING_NOTIFIER');
