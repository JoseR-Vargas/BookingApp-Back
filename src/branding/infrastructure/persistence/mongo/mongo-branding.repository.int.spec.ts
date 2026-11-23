import { Connection } from 'mongoose';
import { describeBrandingRepositoryContract } from '../../../application/ports/branding-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import {
  BRANDING_KEY,
  BrandingRecord,
  BrandingSchema,
} from './branding.entity';
import { MongoBrandingRepository } from './mongo-branding.repository';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoBrandingRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeBrandingRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(BrandingRecord.name, BrandingSchema);
    await model.init();
    const repo = new MongoBrandingRepository(model);
    const collection = connection.collection('branding');
    return {
      reader: repo,
      writer: repo,
      seedLegacyDocument: async (doc) => {
        await collection.insertOne({ key: BRANDING_KEY, ...doc });
      },
      countDocuments: () => collection.countDocuments(),
    };
  });
});
