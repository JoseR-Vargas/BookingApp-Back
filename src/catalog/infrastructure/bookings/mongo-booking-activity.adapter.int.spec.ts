import { Connection } from 'mongoose';
import { describeBookingActivityContract } from '../../application/ports/booking-activity.contract';
import {
  Booking,
  BookingSchema,
} from '../../../bookings/schemas/booking.schema';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../shared/testing/mongo-test-connection';
import { MongoBookingActivityAdapter } from './mongo-booking-activity.adapter';

/** Runs the BookingActivity contract against the bookings collection (`npm run test:int`). */
describe('MongoBookingActivityAdapter', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeBookingActivityContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model<Booking>(Booking.name, BookingSchema);
    const collection = connection.collection(model.collection.name);
    return {
      activity: new MongoBookingActivityAdapter(model),
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
