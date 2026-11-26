import { TEST_TENANT_ID } from '../../../../shared/testing/test-tenant';
import { Connection } from 'mongoose';
import { describeLocationRepositoryContract } from '../../../application/ports/location-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import {
  BusinessSettingsRecord,
  BusinessSettingsSchema,
  SCHEDULE_KEY,
} from './business-settings.entity';
import { SEED_SCHEDULE } from '../../../domain/seed-schedule';
import { MongoBusinessSettingsRepository } from './mongo-business-settings.repository';
import { MongoLocationRepository } from './mongo-location.repository';
import { LocationRecord, LocationSchema } from './location.entity';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoLocationRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeLocationRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(LocationRecord.name, LocationSchema);
    await model.init();
    const settingsModel = connection.model(
      BusinessSettingsRecord.name,
      BusinessSettingsSchema,
    );
    await settingsModel.init();
    const repo = new MongoLocationRepository(
      model,
      new MongoBusinessSettingsRepository(settingsModel),
    );
    const collection = connection.collection('locations');
    return {
      reader: repo,
      writer: repo,
      // An upsert, like the migration and the writer: the server makes the
      // _id, so creation order holds across seeded and inserted documents.
      // A field given as `undefined` is left out, like in an old document.
      seed: async ({ id, ...location }) => {
        const fields: Record<string, unknown> = {
          name: id,
          address: '',
          active: true,
          weekly: SEED_SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
          createdAt: new Date(1_700_000_000_000),
          ...location,
        };
        for (const key of Object.keys(fields)) {
          if (fields[key] === undefined) delete fields[key];
        }
        await collection.updateOne(
          { tenantId: TEST_TENANT_ID, id },
          { $setOnInsert: { ...fields, tenantId: TEST_TENANT_ID } },
          { upsert: true },
        );
      },
      seedLegacySchedule: async (schedule) => {
        await connection
          .collection('business_settings')
          .updateOne(
            { tenantId: TEST_TENANT_ID, key: SCHEDULE_KEY },
            { $setOnInsert: { ...schedule, tenantId: TEST_TENANT_ID } },
            { upsert: true },
          );
      },
      count: () => collection.countDocuments(),
    };
  });
});
