import type { Booking } from '../../domain/booking';

/**
 * The reads the booking use cases need. Absence is `null`; a failure of the
 * store throws (an infrastructure failure, not a business one). A booking
 * never carries its cancel-token hash.
 */
export interface BookingReader {
  findAll(): Promise<Booking[]>;
  findById(id: string): Promise<Booking | null>;
  /** The booking whose cancel token has this hash. */
  findByCancelTokenHash(hash: string): Promise<Booking | null>;
  /**
   * The bookings of the business whose day is between the two dates
   * ('YYYY-MM-DD', both included). The days are the wall clock of the
   * business, the same the booking stores.
   */
  findByDateRange(fromDate: string, toDate: string): Promise<Booking[]>;
  /**
   * The slots blocked by the non-cancelled bookings of a professional on a
   * day, leaving out the booking `excludeId` (the one being edited).
   */
  findOccupiedSlots(
    date: string,
    professionalId: string,
    excludeId?: string,
  ): Promise<{ slots: string[] }[]>;
}

export const BOOKING_READER = Symbol('BOOKING_READER');
