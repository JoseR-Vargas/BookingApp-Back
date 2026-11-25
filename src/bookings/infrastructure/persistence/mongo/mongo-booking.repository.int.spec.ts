import { Connection } from 'mongoose';
import { describeBookingRepositoryContract } from '../../../application/ports/booking-repository.contract';
import { describeBookingStatisticsContract } from '../../../application/ports/booking-statistics.contract';
import { describeOccupiedSlotsReaderContract } from '../../../../availability/application/ports/occupied-slots.reader.contract';
import { describeBookingActivityContract } from '../../../../catalog/application/ports/booking-activity.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { BookingActivityAdapter } from '../../read-model/booking-activity.adapter';
import { BookingOccupiedSlotsReader } from '../../read-model/booking-occupied-slots.reader';
import { Booking, BookingSchema } from './booking.entity';
import { MongoBookingStatistics } from './mongo-booking-statistics';
import { MongoBookingRepository } from './mongo-booking.repository';

/** Runs the shared port contracts against MongoDB (`npm run test:int`). */
describe('MongoBookingRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  const freshModel = async () => {
    await clearTestCollections(connection);
    const model = connection.model<Booking>(Booking.name, BookingSchema);
    // The unique partial index is part of the contract.
    await model.init();
    return model;
  };

  describeBookingRepositoryContract('MongoDB', async () => {
    const repository = new MongoBookingRepository(await freshModel());
    return { reader: repository, writer: repository };
  });

  describeBookingStatisticsContract('MongoDB', async () => {
    const model = await freshModel();
    return {
      statistics: new MongoBookingStatistics(model),
      writer: new MongoBookingRepository(model),
    };
  });

  describeOccupiedSlotsReaderContract('MongoDB (bookings)', async () => {
    const model = await freshModel();
    const collection = connection.collection(model.collection.name);
    return {
      reader: new BookingOccupiedSlotsReader(new MongoBookingRepository(model)),
      seed: async (booking) => {
        await collection.insertOne({
          professional: { id: booking.professionalId, name: 'Pro' },
          services: (booking.serviceIds ?? ['corte']).map((id) => ({
            id,
            name: id,
            price: 1,
            duration: 30,
          })),
          date: booking.date,
          slots: booking.slots,
          status: booking.status,
          ...(booking.location ? { location: booking.location } : {}),
        });
      },
    };
  });

  describeBookingActivityContract('MongoDB (bookings)', async () => {
    const model = await freshModel();
    const collection = connection.collection(model.collection.name);
    return {
      activity: new BookingActivityAdapter(new MongoBookingRepository(model)),
      seed: async (booking) => {
        await collection.insertOne({
          professional: { id: booking.professionalId, name: 'Pro' },
          services: booking.serviceIds.map((id) => ({
            id,
            name: id,
            price: 1,
            duration: 30,
          })),
          date: booking.date,
          status: booking.status,
        });
      },
    };
  });
});
