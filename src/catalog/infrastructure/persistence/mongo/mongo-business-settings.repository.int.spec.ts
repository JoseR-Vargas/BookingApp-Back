import { TEST_TENANT_ID } from '../../../../shared/testing/test-tenant';
import { Connection } from 'mongoose';
import { describeBusinessSettingsContract } from '../../../application/ports/business-settings.contract';
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
import { MongoBusinessSettingsRepository } from './mongo-business-settings.repository';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoBusinessSettingsRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeBusinessSettingsContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(
      BusinessSettingsRecord.name,
      BusinessSettingsSchema,
    );
    await model.init();
    const repo = new MongoBusinessSettingsRepository(model);
    const collection = connection.collection('business_settings');
    return {
      publicReader: repo,
      publicWriter: repo,
      legacy: repo,
      seed: async (settings) => {
        await collection.updateOne(
          { tenantId: TEST_TENANT_ID, key: SCHEDULE_KEY },
          { $setOnInsert: { ...settings, tenantId: TEST_TENANT_ID } },
          { upsert: true },
        );
      },
      stored: async () => {
        const doc = await collection.findOne({ key: SCHEDULE_KEY });
        if (!doc) return null;
        const { _id, key, tenantId, ...rest } = doc;
        void _id;
        void tenantId;
        void key;
        return rest;
      },
    };
  });
});
