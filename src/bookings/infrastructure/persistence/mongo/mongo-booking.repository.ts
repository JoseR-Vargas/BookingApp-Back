import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OccupiedBooking } from '../../../../availability/domain/availability';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Result, err, ok } from '../../../../shared/domain/result';
import { ReminderRecord } from '../../../../shared/domain/reminders';
import { BookingActivityReader } from '../../../application/ports/booking-activity.reader';
import { BookingReader } from '../../../application/ports/booking.reader';
import { BookingWriter } from '../../../application/ports/booking.writer';
import { Booking, BookingChanges, NewBooking } from '../../../domain/booking';
import { InvalidBooking } from '../../../domain/booking.errors';
import { Booking as BookingRecord } from './booking.entity';
import { toDomain, toRecord } from './booking.mapper';

const CANCELLED = 'cancelled';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/** The messages of a Mongoose validation error, or null for any other error. */
function validationMessages(error: unknown): string | null {
  if (error instanceof Error && error.name === 'ValidationError') {
    const errors = (error as Error & { errors?: Record<string, Error> }).errors;
    return Object.values(errors ?? {})
      .map((e) => e.message)
      .join(', ');
  }
  return null;
}

/**
 * Stores bookings in the `bookings` collection. The unique partial index
 * (professional, date, slot) among confirmed bookings is the last word on a
 * taken block; the adapter reports it as the error the caller prepared.
 */
@Injectable()
export class MongoBookingRepository
  implements BookingReader, BookingWriter, BookingActivityReader
{
  constructor(
    @InjectModel(BookingRecord.name)
    private readonly model: Model<BookingRecord>,
  ) {}

  async findAll(): Promise<Booking[]> {
    const records = await this.model.find().exec();
    return records.map(toDomain);
  }

  async findById(id: string): Promise<Booking | null> {
    const record = await this.model.findById(id).exec();
    return record ? toDomain(record) : null;
  }

  async findByCancelTokenHash(hash: string): Promise<Booking | null> {
    // The digest of the cancel link of the booking and the one of the
    // reminder it carries both find the booking they belong to (spec 24).
    const record = await this.model
      .findOne({
        $or: [{ cancelTokenHash: hash }, { reminderCancelTokenHash: hash }],
      })
      .exec();
    return record ? toDomain(record) : null;
  }

  findByDateRange(fromDate: string, toDate: string): Promise<Booking[]> {
    return this.model
      .find({ date: { $gte: fromDate, $lte: toDate } })
      .exec()
      .then((records) => records.map(toDomain));
  }

  findOccupiedSlots(
    date: string,
    professionalId: string,
    excludeId?: string,
  ): Promise<{ slots: string[] }[]> {
    const filter: Record<string, unknown> = {
      date,
      'professional.id': professionalId,
      status: { $ne: CANCELLED },
    };
    if (excludeId) {
      filter._id = { $ne: excludeId };
    }
    return this.model
      .find(filter, { slots: 1 })
      .lean<{ slots: string[] }[]>()
      .exec();
  }

  async create(
    booking: NewBooking,
    cancelTokenHash: string,
    onBlockTaken: DomainError,
  ): Promise<Result<Booking>> {
    try {
      const saved = await new this.model(
        toRecord(booking, cancelTokenHash),
      ).save();
      return ok(toDomain(saved));
    } catch (error) {
      return this.translate(error, onBlockTaken);
    }
  }

  async update(
    id: string,
    changes: BookingChanges,
    onBlockTaken: DomainError,
  ): Promise<Result<Booking | null>> {
    try {
      const updated = await this.model
        .findByIdAndUpdate(id, changes, { new: true, runValidators: true })
        .exec();
      return ok(updated ? toDomain(updated) : null);
    } catch (error) {
      return this.translate(error, onBlockTaken);
    }
  }

  async delete(id: string): Promise<Booking | null> {
    const removed = await this.model.findByIdAndDelete(id).exec();
    return removed ? toDomain(removed) : null;
  }

  async cancelIfConfirmed(id: string): Promise<Booking | null> {
    // Atomic on the status: of two simultaneous requests only one cancels.
    const cancelled = await this.model
      .findOneAndUpdate(
        { _id: id, status: 'confirmed' },
        { status: CANCELLED },
        { new: true },
      )
      .exec();
    return cancelled ? toDomain(cancelled) : null;
  }

  async saveReminders(
    id: string,
    reminders: ReminderRecord[],
    reminderCancelTokenHash?: string,
  ): Promise<Result<Booking | null>> {
    const update: Record<string, unknown> = { reminders };
    if (reminderCancelTokenHash) {
      update.reminderCancelTokenHash = reminderCancelTokenHash;
    }
    const updated = await this.model
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .exec();
    return ok(updated ? toDomain(updated) : null);
  }

  async findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]> {
    const found = await this.model
      .find(
        {
          date,
          'professional.id': { $in: professionalIds },
          status: { $ne: CANCELLED },
        },
        { 'professional.id': 1, slots: 1 },
      )
      .lean<{ professional?: { id: string }; slots: string[] }[]>()
      .exec();
    return found.flatMap((booking) =>
      booking.professional
        ? [{ professionalId: booking.professional.id, slots: booking.slots }]
        : [],
    );
  }

  countUpcomingConfirmedOfProfessional(
    professionalId: string,
    today: string,
  ): Promise<number> {
    return this.model
      .countDocuments({
        'professional.id': professionalId,
        status: 'confirmed',
        date: { $gte: today },
      })
      .exec();
  }

  async hasAnyOfProfessional(professionalId: string): Promise<boolean> {
    const found = await this.model
      .exists({ 'professional.id': professionalId })
      .exec();
    return found !== null;
  }

  countUpcomingConfirmedOfService(
    serviceId: string,
    today: string,
  ): Promise<number> {
    return this.model
      .countDocuments({
        'services.id': serviceId,
        status: 'confirmed',
        date: { $gte: today },
      })
      .exec();
  }

  async hasAnyOfService(serviceId: string): Promise<boolean> {
    const found = await this.model.exists({ 'services.id': serviceId }).exec();
    return found !== null;
  }

  /** A duplicate key is a taken block; a rejected shape is a validation error; the rest is infrastructure. */
  private translate<T>(error: unknown, onBlockTaken: DomainError): Result<T> {
    if (isDuplicateKeyError(error)) {
      return err(onBlockTaken);
    }
    const messages = validationMessages(error);
    if (messages !== null) {
      return err(new InvalidBooking(messages));
    }
    throw error;
  }
}
