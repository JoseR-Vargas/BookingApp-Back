import { TEST_TENANT_ID } from '../../../../shared/testing/test-tenant';
import { Connection } from 'mongoose';
import { describeProfessionalRepositoryContract } from '../../../application/ports/professional-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { ProfessionalRecord, ProfessionalSchema } from './professional.entity';
import { MongoProfessionalRepository } from './mongo-professional.repository';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoProfessionalRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeProfessionalRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(ProfessionalRecord.name, ProfessionalSchema);
    await model.init();
    const repo = new MongoProfessionalRepository(model);
    const collection = connection.collection('professionals');
    return {
      reader: repo,
      writer: repo,
      photos: repo,
      // An upsert, like the seed and the writer: the server makes the _id, so
      // creation order holds across seeded and inserted documents.
      seed: async ({ id, ...document }) => {
        await collection.updateOne(
          { tenantId: TEST_TENANT_ID, id },
          {
            $setOnInsert: {
              tenantId: TEST_TENANT_ID,
              specialty: '',
              experience: '',
              rating: 5,
              avatar: 'fas fa-user',
              active: true,
              ...document,
            },
          },
          { upsert: true },
        );
      },
      count: () => collection.countDocuments(),
    };
  });
});
