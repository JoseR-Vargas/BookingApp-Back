// ===== LECTOR DE RESERVAS (MONGO) =====
// The upcoming bookings, read from the bookings collection. PROVISIONAL: the
// collection belongs to `bookings` (spec 14 moved the module to hexagonal;
// this adapter stays here until the read model replaces it).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from '../../bookings/infrastructure/persistence/mongo/booking.entity';
import { ScheduledBooking } from '../domain/schedule-impact.rules';
import { UpcomingBookingsReader } from '../application/ports/upcoming-bookings.reader';

@Injectable()
export class MongoUpcomingBookingsReader implements UpcomingBookingsReader {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
  ) {}

  async findUpcoming(
    today: string,
    scope?: { locationId: string },
  ): Promise<ScheduledBooking[]> {
    const bookings = await this.bookingModel
      .find(
        { date: { $gte: today }, status: { $ne: 'cancelled' } },
        scope
          ? { date: 1, time: 1, slots: 1, 'location.id': 1 }
          : { date: 1, time: 1, slots: 1 },
      )
      .lean<ScheduledBooking[]>()
      .exec();
    return bookings;
  }
}
