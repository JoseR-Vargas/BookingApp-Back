import { Inject, Injectable } from '@nestjs/common';
import { BookingActivity } from '../../../catalog/application/ports/booking-activity.port';
import {
  BOOKING_ACTIVITY_READER,
  BookingActivityReader,
} from '../../application/ports/booking-activity.reader';

/**
 * Answers the catalog's questions about bookings (can a professional or a
 * service be deleted or have its id reused?) from the bookings of this module.
 */
@Injectable()
export class BookingActivityAdapter implements BookingActivity {
  constructor(
    @Inject(BOOKING_ACTIVITY_READER)
    private readonly bookings: BookingActivityReader,
  ) {}

  countUpcomingConfirmed(
    professionalId: string,
    today: string,
  ): Promise<number> {
    return this.bookings.countUpcomingConfirmedOfProfessional(
      professionalId,
      today,
    );
  }

  hasAny(professionalId: string): Promise<boolean> {
    return this.bookings.hasAnyOfProfessional(professionalId);
  }

  countUpcomingConfirmedForService(
    serviceId: string,
    today: string,
  ): Promise<number> {
    return this.bookings.countUpcomingConfirmedOfService(serviceId, today);
  }

  hasAnyForService(serviceId: string): Promise<boolean> {
    return this.bookings.hasAnyOfService(serviceId);
  }
}
