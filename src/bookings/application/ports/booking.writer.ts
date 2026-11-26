import type { DomainError } from '../../../shared/domain/domain-error';
import type { Result } from '../../../shared/domain/result';
import type { ReminderRecord } from '../../../shared/domain/reminders';
import type { Booking, BookingChanges, NewBooking } from '../../domain/booking';

/**
 * Writes bookings. The store enforces one confirmed booking per professional,
 * date and slot: when it reports the block as taken (two requests racing for
 * it), the writer answers `Err(onBlockTaken)`, the error the caller prepared.
 * A store that rejects the shape of the data answers an `Err` of kind
 * `validation`. Any other failure of the store throws.
 */
export interface BookingWriter {
  /** Stores the booking with the hash of its cancel token (never the token). */
  create(
    booking: NewBooking,
    cancelTokenHash: string,
    onBlockTaken: DomainError,
  ): Promise<Result<Booking>>;

  /** Applies `changes`; `ok(null)` when the booking does not exist. */
  update(
    id: string,
    changes: BookingChanges,
    onBlockTaken: DomainError,
  ): Promise<Result<Booking | null>>;

  /** The deleted booking, or null when it did not exist. */
  delete(id: string): Promise<Booking | null>;

  /**
   * Cancels the booking only if it is still confirmed, in one atomic step: of
   * two simultaneous calls only one gets the booking back, the other gets null.
   */
  cancelIfConfirmed(id: string): Promise<Booking | null>;

  /**
   * Replaces the log of reminders of the booking (spec 24). The caller owns
   * the rule of one entry per window and channel; the store only keeps what
   * it is given. `reminderCancelTokenHash` is the digest of the secret the
   * reminder carries, kept beside the log so the cancel link of the reminder
   * keeps working.
   */
  saveReminders(
    id: string,
    reminders: ReminderRecord[],
    reminderCancelTokenHash?: string,
  ): Promise<Result<Booking | null>>;
}

export const BOOKING_WRITER = Symbol('BOOKING_WRITER');
