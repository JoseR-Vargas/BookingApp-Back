import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from '../../../bookings/schemas/booking.schema';
import { BookingActivity } from '../../application/ports/booking-activity.port';

/**
 * Answers the catalog's questions about bookings by reading the bookings
 * collection (read-only: the catalog never writes a booking). TEMPORARY, until
 * the `bookings` module is migrated (spec 13) and answers by itself.
 */
@Injectable()
export class MongoBookingActivityAdapter implements BookingActivity {
  constructor(
    @InjectModel(Booking.name) private readonly model: Model<Booking>,
  ) {}

  countUpcomingConfirmed(
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

  async hasAny(professionalId: string): Promise<boolean> {
    const found = await this.model
      .exists({ 'professional.id': professionalId })
      .exec();
    return found !== null;
  }

  countUpcomingConfirmedForService(
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

  async hasAnyForService(serviceId: string): Promise<boolean> {
    const found = await this.model.exists({ 'services.id': serviceId }).exec();
    return found !== null;
  }
}
