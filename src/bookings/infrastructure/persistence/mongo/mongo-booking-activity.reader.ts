// ===== LECTOR DE ACTIVIDAD DE RESERVAS =====
// What the rest of the system asks about the bookings of a professional or a service: how many
// confirmed bookings are coming, and whether any booking points at them. The store is the
// bookings collection, read through the same entity the repository uses.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from './booking.entity';
import { BookingActivityReader } from '../../../application/ports/booking-activity.reader';

@Injectable()
export class MongoBookingActivityReader implements BookingActivityReader {
  constructor(
    @InjectModel(Booking.name)
    private readonly model: Model<Booking>,
  ) {}

  async findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<{ date: string; professionalId: string; slots: string[] }[]> {
    const bookings = await this.model
      .find({
        date,
        status: { $ne: 'cancelled' },
        'professional.id': { $in: professionalIds },
      })
      .select('date professional.id slots')
      .lean<{ date: string; professional: { id: string }; slots: string[] }[]>()
      .exec();
    return bookings.map((booking) => ({
      date: booking.date,
      professionalId: booking.professional.id,
      slots: booking.slots ?? [],
    }));
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
}
