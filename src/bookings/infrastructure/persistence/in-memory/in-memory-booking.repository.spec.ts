import { DomainError } from '../../../../shared/domain/domain-error';
import { describeBookingRepositoryContract } from '../../../application/ports/booking-repository.contract';
import { describeBookingStatisticsContract } from '../../../application/ports/booking-statistics.contract';
import { describeOccupiedSlotsReaderContract } from '../../../../availability/application/ports/occupied-slots.reader.contract';
import { describeBookingActivityContract } from '../../../../catalog/application/ports/booking-activity.contract';
import { BookingActivityAdapter } from '../../read-model/booking-activity.adapter';
import { BookingOccupiedSlotsReader } from '../../read-model/booking-occupied-slots.reader';
import { InMemoryBookingStatistics } from './in-memory-booking-statistics';
import { InMemoryBookingRepository } from './in-memory-booking.repository';

describeBookingRepositoryContract('in memory', () => {
  const repository = new InMemoryBookingRepository();
  return Promise.resolve({ reader: repository, writer: repository });
});

describeBookingStatisticsContract('in memory', () => {
  const repository = new InMemoryBookingRepository();
  return Promise.resolve({
    statistics: new InMemoryBookingStatistics(repository),
    writer: repository,
  });
});

/** The ports of availability and catalog, answered by the bookings of this store. */
describeOccupiedSlotsReaderContract('bookings (in memory)', () => {
  const repository = new InMemoryBookingRepository();
  let seq = 0;
  return Promise.resolve({
    reader: new BookingOccupiedSlotsReader(repository),
    seed: async (booking) => {
      await repository.create(
        {
          client: { name: 'C', phone: '1' },
          services: (booking.serviceIds ?? ['corte']).map((id) => ({
            id,
            name: id,
            price: 1,
            duration: 30,
          })),
          totalPrice: 1,
          totalDuration: 30,
          professional: { id: booking.professionalId, name: 'Pro' },
          location: booking.location,
          date: booking.date,
          time: booking.slots[0],
          slots: booking.slots,
          status: booking.status,
        },
        `hash-${++seq}`,
        new DomainError('validation', 'taken'),
      );
    },
  });
});

describeBookingActivityContract('bookings (in memory)', () => {
  const repository = new InMemoryBookingRepository();
  let seq = 0;
  return Promise.resolve({
    activity: new BookingActivityAdapter(repository),
    seed: async (booking) => {
      const time = `${String(seq % 24).padStart(2, '0')}:${String((seq * 7) % 60).padStart(2, '0')}`;
      await repository.create(
        {
          client: { name: 'C', phone: '1' },
          services: booking.serviceIds.map((id) => ({
            id,
            name: id,
            price: 1,
            duration: 30,
          })),
          totalPrice: 1,
          totalDuration: 30,
          professional: { id: booking.professionalId, name: 'Pro' },
          date: booking.date,
          time,
          slots: [`slot-${seq}`],
          status: booking.status,
        },
        `hash-${++seq}`,
        new DomainError('validation', 'taken'),
      );
    },
  });
});
