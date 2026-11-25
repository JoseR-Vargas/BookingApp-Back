import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from '../../../../bookings/schemas/booking.schema';
import { OccupiedSlotsReader } from '../../../application/ports/occupied-slots.reader';
import { OccupiedBooking } from '../../../domain/availability';

type BookedSlot = { professional?: { id: string }; slots: string[] };

/**
 * Reads the blocked slots from the bookings collection through the `Booking`
 * schema of `bookings`.
 *
 * PROVISIONAL (spec 13): the collection belongs to `bookings`; this adapter is
 * replaced by that module's reader when it migrates (spec 14).
 */
@Injectable()
export class MongoOccupiedSlotsReader implements OccupiedSlotsReader {
  constructor(
    @InjectModel(Booking.name) private readonly bookings: Model<Booking>,
  ) {}

  async findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]> {
    const found = await this.bookings
      .find(
        {
          date,
          'professional.id': { $in: professionalIds },
          status: { $ne: 'cancelled' },
        },
        { 'professional.id': 1, slots: 1 },
      )
      .lean<BookedSlot[]>()
      .exec();
    return found.flatMap((booking) =>
      booking.professional
        ? [{ professionalId: booking.professional.id, slots: booking.slots }]
        : [],
    );
  }
}
