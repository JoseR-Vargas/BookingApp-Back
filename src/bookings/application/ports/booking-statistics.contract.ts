import { DomainError } from '../../../shared/domain/domain-error';
import { BookingWriter } from './booking.writer';
import { BookingStatisticsReader } from './booking-statistics.reader';
import { newBooking } from './booking-repository.contract';

export interface BookingStatisticsFixture {
  statistics: BookingStatisticsReader;
  /** Seeds bookings of the same store the statistics read. */
  writer: BookingWriter;
}

const unused = new DomainError('validation', 'unused');

/** Behavior every BookingStatisticsReader adapter must honor. */
export function describeBookingStatisticsContract(
  name: string,
  factory: () => Promise<BookingStatisticsFixture>,
): void {
  describe(`BookingStatisticsReader contract: ${name}`, () => {
    let fixture: BookingStatisticsFixture;
    let slot = 0;

    beforeEach(async () => {
      fixture = await factory();
    });

    const seed = async (
      date: string,
      totalPrice: number,
      status: 'confirmed' | 'cancelled' = 'confirmed',
    ) => {
      const time = `${String(8 + slot++).padStart(2, '0')}:00`;
      const result = await fixture.writer.create(
        newBooking({ date, totalPrice, status, time, slots: [time] }),
        `hash-${name}-${slot}-${Math.random()}`,
        unused,
      );
      if (!result.ok) throw new Error(result.error.message);
    };

    it('answers zeros without bookings', async () => {
      const { statistics } = fixture;

      await expect(statistics.countAll()).resolves.toBe(0);
      await expect(statistics.totalRevenue()).resolves.toBe(0);
      await expect(statistics.countOnDate('2030-06-17')).resolves.toBe(0);
    });

    it('counts every booking whatever its status, and sums their price', async () => {
      await seed('2030-06-17', 1200);
      await seed('2030-06-18', 2500);
      await seed('2030-06-18', 700, 'cancelled');

      await expect(fixture.statistics.countAll()).resolves.toBe(3);
      await expect(fixture.statistics.totalRevenue()).resolves.toBe(4400);
    });

    it('counts the bookings of one date', async () => {
      await seed('2030-06-17', 1);
      await seed('2030-06-18', 1);
      await seed('2030-06-18', 1, 'cancelled');

      await expect(fixture.statistics.countOnDate('2030-06-18')).resolves.toBe(
        2,
      );
      await expect(fixture.statistics.countOnDate('2030-06-19')).resolves.toBe(
        0,
      );
    });
  });
}
