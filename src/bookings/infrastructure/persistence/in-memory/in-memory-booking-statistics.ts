import { BookingStatisticsReader } from '../../../application/ports/booking-statistics.reader';
import { InMemoryBookingRepository } from './in-memory-booking.repository';

/** Counts the bookings of an in-memory repository. */
export class InMemoryBookingStatistics implements BookingStatisticsReader {
  constructor(private readonly bookings: InMemoryBookingRepository) {}

  countAll(): Promise<number> {
    return Promise.resolve(this.bookings.all().length);
  }

  totalRevenue(): Promise<number> {
    return Promise.resolve(
      this.bookings.all().reduce((sum, booking) => sum + booking.totalPrice, 0),
    );
  }

  countOnDate(date: string): Promise<number> {
    return Promise.resolve(
      this.bookings.all().filter((booking) => booking.date === date).length,
    );
  }
}
