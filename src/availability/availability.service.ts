import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from '../bookings/schemas/booking.schema';
import { CatalogService } from '../catalog/catalog.service';
import {
  OccupyingBooking,
  buildDaySlots,
  dayOfWeekFromIsoDate,
  freeStartTimes,
  occupiedSlots,
  offeredStarts,
  slotsRequired,
} from './availability.calculator';

export interface ProfessionalAvailability {
  id: string;
  name: string;
  slots: string[];
}

export interface Availability {
  date: string;
  closed: boolean;
  services: { id: string; name: string; duration: number }[];
  totalDuration: number;
  professionals: ProfessionalAvailability[];
}

type BookedSlot = OccupyingBooking & { professional: { id: string } };

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * Free start times, per professional offering ALL the services, for the
   * back-to-back block of the services. Throws a ServiceSelectionError for an
   * empty, duplicated or unknown service id.
   */
  async getAvailability(
    date: string,
    serviceIds: string[],
  ): Promise<Availability> {
    const dayOfWeek = dayOfWeekFromIsoDate(date);
    if (dayOfWeek === null) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }
    const { services, professionals, totalDuration } =
      await this.catalogService.resolveServices(serviceIds);

    const schedule = await this.catalogService.getSchedule();
    const daySlots = buildDaySlots(dayOfWeek, schedule);
    const closed = daySlots.length === 0;
    const bookings = closed
      ? []
      : await this.findActiveBookings(
          date,
          professionals.map((professional) => professional.id),
        );

    const interval = schedule.slotIntervalMinutes;
    const required = slotsRequired(totalDuration, interval);
    const offered = new Set(offeredStarts(dayOfWeek, schedule));

    return {
      date,
      closed,
      services: services.map(({ id, name, duration }) => ({
        id,
        name,
        duration,
      })),
      totalDuration,
      professionals: professionals.map((professional) => ({
        id: professional.id,
        name: professional.name,
        slots: freeStartTimes(
          daySlots,
          occupiedSlots(
            bookings.filter((b) => b.professional?.id === professional.id),
          ),
          required,
          interval,
        ).filter((time) => offered.has(time)),
      })),
    };
  }

  private findActiveBookings(
    date: string,
    professionalIds: string[],
  ): Promise<BookedSlot[]> {
    return this.bookingModel
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
  }
}
