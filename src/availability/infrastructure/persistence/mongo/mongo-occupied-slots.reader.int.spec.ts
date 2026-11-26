import { TEST_TENANT_ID } from '../../../../shared/testing/test-tenant';
import { Connection } from 'mongoose';
import {
  Booking,
  BookingSchema,
} from '../../../../bookings/schemas/booking.schema';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { describeOccupiedSlotsReaderContract } from '../../../application/ports/occupied-slots.reader.contract';
import { MongoOccupiedSlotsReader } from './mongo-occupied-slots.reader';

/** Runs the OccupiedSlotsReader contract against the bookings collection (`npm run test:int`). */
describe('MongoOccupiedSlotsReader', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeOccupiedSlotsReaderContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model<Booking>(Booking.name, BookingSchema);
    const collection = connection.collection(model.collection.name);
    return {
      reader: new MongoOccupiedSlotsReader(model),
      seed: async (booking) => {
        const serviceIds = booking.serviceIds ?? ['corte'];
        await collection.insertOne({
          tenantId: TEST_TENANT_ID,
          client: { name: 'Client', phone: '+598 99 000 000' },
          services: serviceIds.map((id) => ({
            id,
            name: id,
            price: 1,
            duration: 30,
          })),
          totalPrice: serviceIds.length,
          totalDuration: serviceIds.length * 30,
          professional: { id: booking.professionalId, name: 'Pro' },
          ...(booking.location ? { location: booking.location } : {}),
          date: booking.date,
          time: booking.slots[0],
          slots: booking.slots,
          notes: '',
          status: booking.status,
        });
      },
    };
  });
});
