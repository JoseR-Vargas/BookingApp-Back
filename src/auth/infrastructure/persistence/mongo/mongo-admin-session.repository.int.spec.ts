import { Connection, Types } from 'mongoose';
import { describeAdminSessionRepositoryContract } from '../../../application/ports/admin-session-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { tenantScopeStorage } from '../../../../shared/infrastructure/tenancy/tenant-scope.storage';
import { AdminSessionRecord, AdminSessionSchema } from './admin-session.entity';
import { MongoAdminSessionRepository } from './mongo-admin-session.repository';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoAdminSessionRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeAdminSessionRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(AdminSessionRecord.name, AdminSessionSchema);
    await model.init();
    const repo = new MongoAdminSessionRepository(model);
    const otherBusiness = new Types.ObjectId().toHexString();
    return {
      reader: repo,
      writer: repo,
      inOtherBusiness: (fn) =>
        tenantScopeStorage.run({ tenantId: otherBusiness, slug: 'other' }, fn),
    };
  });

  it('declares the TTL index on expiresAt and the tenant-first unique index', async () => {
    const model = connection.model(AdminSessionRecord.name, AdminSessionSchema);
    await model.init();
    const indexes = await connection.collection('admin_sessions').indexes();
    const ttl = indexes.find((index) => index.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
    const unique = indexes.find(
      (index) => index.key.tenantId === 1 && index.key.tokenHash === 1,
    );
    expect(unique?.unique).toBe(true);
  });
});
