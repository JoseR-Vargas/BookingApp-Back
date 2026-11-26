import { DomainError } from '../../../../shared/domain/domain-error';
import { Result, err, ok } from '../../../../shared/domain/result';
import { ReminderRecord } from '../../../../shared/domain/reminders';
import { OccupiedBooking } from '../../../../availability/domain/availability';
import { BookingActivityReader } from '../../../application/ports/booking-activity.reader';
import { BookingReader } from '../../../application/ports/booking.reader';
import { BookingWriter } from '../../../application/ports/booking.writer';
import {
  BOOKING_STATUSES,
  Booking,
  BookingChanges,
  NewBooking,
} from '../../../domain/booking';
import { InvalidBooking } from '../../../domain/booking.errors';

/** The fields an update may store; anything else is dropped, like a strict schema does. */
const STORED_FIELDS = [
  'client',
  'services',
  'totalPrice',
  'totalDuration',
  'professional',
  'location',
  'date',
  'time',
  'slots',
  'notes',
  'status',
] as const;

interface Stored {
  booking: Booking;
  cancelTokenHash?: string;
  /** The digest of the secret the reminder of the booking carries (spec 24). */
  reminderCancelTokenHash?: string;
}

/**
 * A deep copy that keeps the dates as dates: `structuredClone` would bring
 * dates from another realm, and `instanceof Date` would fail.
 */
const copy = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => copy(item)) as unknown as T;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        copy(item),
      ]),
    ) as unknown as T;
  }
  return value;
};

/**
 * Keeps the bookings in memory: the swap proof for the database and the
 * adapter of the use case tests. It honors the same contract as the MongoDB
 * one, the unique block per professional, date and slot included.
 */
export class InMemoryBookingRepository
  implements BookingReader, BookingWriter, BookingActivityReader
{
  private stored: Stored[] = [];
  private counter = 0;

  /** Every booking, for the statistics adapter of the same store. */
  all(): Booking[] {
    return this.stored.map(({ booking }) => copy(booking));
  }

  findAll(): Promise<Booking[]> {
    return Promise.resolve(this.all());
  }

  findById(id: string): Promise<Booking | null> {
    return Promise.resolve(this.get(id));
  }

  findByCancelTokenHash(hash: string): Promise<Booking | null> {
    // The digest of the cancel link of the booking and the one of the
    // reminder it carries both find the booking they belong to (spec 24).
    const found = this.stored.find(
      (entry) =>
        entry.cancelTokenHash === hash ||
        entry.reminderCancelTokenHash === hash,
    );
    return Promise.resolve(found ? copy(found.booking) : null);
  }

  findByDateRange(fromDate: string, toDate: string): Promise<Booking[]> {
    return Promise.resolve(
      this.stored
        .map(({ booking }) => booking)
        .filter((booking) => booking.date >= fromDate && booking.date <= toDate)
        .map((booking) => copy(booking)),
    );
  }

  findOccupiedSlots(
    date: string,
    professionalId: string,
    excludeId?: string,
  ): Promise<{ slots: string[] }[]> {
    return Promise.resolve(
      this.stored
        .map(({ booking }) => booking)
        .filter(
          (booking) =>
            booking.date === date &&
            booking.professional.id === professionalId &&
            booking.status !== 'cancelled' &&
            booking.id !== excludeId,
        )
        .map((booking) => ({ slots: [...booking.slots] })),
    );
  }

  create(
    booking: NewBooking,
    cancelTokenHash: string,
    onBlockTaken: DomainError,
  ): Promise<Result<Booking>> {
    const now = new Date();
    const created: Booking = copy({
      ...booking,
      notes: booking.notes ?? '',
      id: `mem-${++this.counter}`,
      createdAt: now,
      updatedAt: now,
    });
    if (this.blockTaken(created)) {
      return Promise.resolve(err(onBlockTaken));
    }
    this.stored.push({ booking: created, cancelTokenHash });
    return Promise.resolve(ok(copy(created)));
  }

  update(
    id: string,
    changes: BookingChanges,
    onBlockTaken: DomainError,
  ): Promise<Result<Booking | null>> {
    const entry = this.stored.find(({ booking }) => booking.id === id);
    if (!entry) {
      return Promise.resolve(ok(null));
    }
    const status = changes.status;
    if (
      status !== undefined &&
      !(BOOKING_STATUSES as readonly unknown[]).includes(status)
    ) {
      return Promise.resolve(
        err(
          new InvalidBooking(
            `\`${String(status as string)}\` is not a valid enum value for path \`status\`.`,
          ),
        ),
      );
    }
    const updated: Booking = copy({ ...entry.booking, updatedAt: new Date() });
    for (const field of STORED_FIELDS) {
      if (field in changes && changes[field] !== undefined) {
        (updated as unknown as Record<string, unknown>)[field] = copy(
          changes[field],
        );
      }
    }
    if (this.blockTaken(updated)) {
      return Promise.resolve(err(onBlockTaken));
    }
    entry.booking = updated;
    return Promise.resolve(ok(copy(updated)));
  }

  delete(id: string): Promise<Booking | null> {
    const index = this.stored.findIndex(({ booking }) => booking.id === id);
    if (index < 0) {
      return Promise.resolve(null);
    }
    const [removed] = this.stored.splice(index, 1);
    return Promise.resolve(copy(removed.booking));
  }

  cancelIfConfirmed(id: string): Promise<Booking | null> {
    const entry = this.stored.find(({ booking }) => booking.id === id);
    if (!entry || entry.booking.status !== 'confirmed') {
      return Promise.resolve(null);
    }
    entry.booking = { ...entry.booking, status: 'cancelled' };
    return Promise.resolve(copy(entry.booking));
  }

  saveReminders(
    id: string,
    reminders: ReminderRecord[],
    reminderCancelTokenHash?: string,
  ): Promise<Result<Booking | null>> {
    const entry = this.stored.find(({ booking }) => booking.id === id);
    if (!entry) {
      return Promise.resolve(ok(null));
    }
    entry.booking = { ...entry.booking, reminders: copy(reminders) };
    if (reminderCancelTokenHash) {
      entry.reminderCancelTokenHash = reminderCancelTokenHash;
    }
    return Promise.resolve(ok(copy(entry.booking)));
  }

  findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]> {
    return Promise.resolve(
      this.all()
        .filter(
          (booking) =>
            booking.date === date &&
            booking.status !== 'cancelled' &&
            professionalIds.includes(booking.professional.id),
        )
        .map((booking) => ({
          professionalId: booking.professional.id,
          slots: booking.slots,
        })),
    );
  }

  countUpcomingConfirmedOfProfessional(
    professionalId: string,
    today: string,
  ): Promise<number> {
    return Promise.resolve(
      this.all().filter(
        (booking) =>
          booking.professional.id === professionalId &&
          booking.status === 'confirmed' &&
          booking.date >= today,
      ).length,
    );
  }

  hasAnyOfProfessional(professionalId: string): Promise<boolean> {
    return Promise.resolve(
      this.all().some((booking) => booking.professional.id === professionalId),
    );
  }

  countUpcomingConfirmedOfService(
    serviceId: string,
    today: string,
  ): Promise<number> {
    return Promise.resolve(
      this.all().filter(
        (booking) =>
          booking.services.some((service) => service.id === serviceId) &&
          booking.status === 'confirmed' &&
          booking.date >= today,
      ).length,
    );
  }

  hasAnyOfService(serviceId: string): Promise<boolean> {
    return Promise.resolve(
      this.all().some((booking) =>
        booking.services.some((service) => service.id === serviceId),
      ),
    );
  }

  private get(id: string): Booking | null {
    const found = this.stored.find(({ booking }) => booking.id === id);
    return found ? copy(found.booking) : null;
  }

  /** The unique index: one confirmed booking per professional, date and slot. */
  private blockTaken(candidate: Booking): boolean {
    if (candidate.status !== 'confirmed') {
      return false;
    }
    return this.stored.some(
      ({ booking }) =>
        booking.id !== candidate.id &&
        booking.status === 'confirmed' &&
        booking.professional.id === candidate.professional.id &&
        booking.date === candidate.date &&
        booking.slots.some((slot) => candidate.slots.includes(slot)),
    );
  }
}
