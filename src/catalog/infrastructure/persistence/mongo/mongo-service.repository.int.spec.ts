import { Connection } from 'mongoose';
import { describeServiceRepositoryContract } from '../../../application/ports/service-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { MongoServiceRepository } from './mongo-service.repository';
import { ServiceRecord, ServiceSchema } from './service.entity';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoServiceRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeServiceRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(ServiceRecord.name, ServiceSchema);
    await model.init();
    const repo = new MongoServiceRepository(model);
    const collection = connection.collection('services');
    return {
      reader: repo,
      writer: repo,
      // An upsert, like the seed and the writer: the server makes the _id, so
      // creation order holds across seeded and inserted documents.
      seed: async ({ id, ...service }) => {
        await collection.updateOne(
          { id },
          {
            $setOnInsert: {
              name: id,
              description: '',
              price: 0,
              duration: 30,
              professionals: [],
              icon: 'fas fa-star',
              active: true,
              ...service,
            },
          },
          { upsert: true },
        );
      },
      count: () => collection.countDocuments(),
    };
  });
});
