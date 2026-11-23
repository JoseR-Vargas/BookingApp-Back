import { Connection } from 'mongoose';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from './mongo-test-connection';

describe('Mongo integration harness', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  beforeEach(async () => {
    await clearTestCollections(connection);
  });

  it('works on the dedicated *_int_test database only', () => {
    expect(connection.name.endsWith('_int_test')).toBe(true);
  });

  it('empties every collection between tests', async () => {
    const things = connection.collection('harness_things');
    await things.insertOne({ n: 1 });
    await expect(things.countDocuments()).resolves.toBe(1);
    await clearTestCollections(connection);
    await expect(things.countDocuments()).resolves.toBe(0);
  });

  it('starts each test with empty collections', async () => {
    await expect(
      connection.collection('harness_things').countDocuments(),
    ).resolves.toBe(0);
  });
});
