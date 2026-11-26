import type { OccupiedBooking } from '../../domain/availability';

/**
 * The agenda blocks already taken. PROVISIONAL: the bookings collection
 * belongs to `bookings`; the port is replaced by that module's reader in
 * spec 14.
 */
export interface OccupiedSlotsReader {
  /**
   * The bookings that block the agenda on `date` for any of the professionals.
   * Cancelled bookings never block. Occupancy is per professional, wherever
   * the booking happens: a booking at another location blocks the same hours.
   * A failure of the store throws (an infrastructure failure, not a business one).
   */
  findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]>;
}

export const OCCUPIED_SLOTS_READER = Symbol('OCCUPIED_SLOTS_READER');
