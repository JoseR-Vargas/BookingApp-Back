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
  service: { id: string; name: string; duration: number };
  professionals: ProfessionalAvailability[];
}

type BookedSlot = OccupyingBooking & { professional: { id: string } };

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    private readonly catalogService: CatalogService,
  ) {}

  /** Returns null when the service does not exist. */
  async getAvailability(
    date: string,
    serviceId: string,
  ): Promise<Availability | null> {
    const dayOfWeek = dayOfWeekFromIsoDate(date);
    if (dayOfWeek === null) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }
    const service = this.catalogService.findService(serviceId);
    if (!service) {
      return null;
    }

    const { schedule, professionals: allProfessionals } =
      this.catalogService.getCatalog();
    const professionals = allProfessionals.filter((professional) =>
      service.professionals.includes(professional.id),
    );
    const daySlots = buildDaySlots(dayOfWeek, schedule);
    const closed = daySlots.length === 0;
    const bookings = closed
      ? []
      : await this.findActiveBookings(
          date,
          professionals.map((professional) => professional.id),
        );

    const interval = schedule.slotIntervalMinutes;
    const required = slotsRequired(service.duration, interval);

    return {
      date,
      closed,
      service: {
        id: service.id,
        name: service.name,
        duration: service.duration,
      },
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
        ),
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
