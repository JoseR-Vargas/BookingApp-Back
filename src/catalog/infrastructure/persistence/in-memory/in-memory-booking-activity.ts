import { BookingActivity } from '../../../application/ports/booking-activity.port';
import { SeedBooking } from '../../../application/ports/booking-activity.contract';

/** Keeps bookings in memory, only as far as the catalog asks about them. */
export class InMemoryBookingActivity implements BookingActivity {
  private bookings: SeedBooking[] = [];

  /** Records a booking, bypassing the port. */
  seed(booking: SeedBooking): void {
    this.bookings.push({ ...booking, serviceIds: [...booking.serviceIds] });
  }

  countUpcomingConfirmed(
    professionalId: string,
    today: string,
  ): Promise<number> {
    return Promise.resolve(
      this.bookings.filter(
        (b) =>
          b.professionalId === professionalId &&
          b.status === 'confirmed' &&
          b.date >= today,
      ).length,
    );
  }

  hasAny(professionalId: string): Promise<boolean> {
    return Promise.resolve(
      this.bookings.some((b) => b.professionalId === professionalId),
    );
  }

  countUpcomingConfirmedForService(
    serviceId: string,
    today: string,
  ): Promise<number> {
    return Promise.resolve(
      this.bookings.filter(
        (b) =>
          b.serviceIds.includes(serviceId) &&
          b.status === 'confirmed' &&
          b.date >= today,
      ).length,
    );
  }

  hasAnyForService(serviceId: string): Promise<boolean> {
    return Promise.resolve(
      this.bookings.some((b) => b.serviceIds.includes(serviceId)),
    );
  }
}
