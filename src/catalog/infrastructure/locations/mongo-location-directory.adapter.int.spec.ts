import { Connection } from 'mongoose';
import { describeLocationDirectoryContract } from '../../application/ports/location-directory.contract';
import { SCHEDULE } from '../../catalog.config';
import {
  BusinessSettingsRecord,
  BusinessSettingsSchema,
} from '../../schemas/business-settings.schema';
import { LocationRecord, LocationSchema } from '../../schemas/location.schema';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../shared/testing/mongo-test-connection';
import { MongoLocationDirectoryAdapter } from './mongo-location-directory.adapter';

/** Runs the LocationDirectory contract against the locations collection (`npm run test:int`). */
describe('MongoLocationDirectoryAdapter', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeLocationDirectoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const locations = connection.model(LocationRecord.name, LocationSchema);
    const settings = connection.model(
      BusinessSettingsRecord.name,
      BusinessSettingsSchema,
    );
    const collection = connection.collection(locations.collection.name);
    return {
      directory: new MongoLocationDirectoryAdapter(locations, settings),
      seed: async (location) => {
        await collection.insertOne({
          ...location,
          name: location.id,
          address: '',
          weekly: SCHEDULE.weekly,
          slotIntervalMinutes: SCHEDULE.slotIntervalMinutes,
          startIntervalMinutes: SCHEDULE.startIntervalMinutes,
        });
      },
    };
  });
});
