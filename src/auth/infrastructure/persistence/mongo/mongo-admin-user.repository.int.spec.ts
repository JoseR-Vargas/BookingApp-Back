import { Connection, Types } from 'mongoose';
import { describeAdminUserRepositoryContract } from '../../../application/ports/admin-user-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { tenantScopeStorage } from '../../../../shared/infrastructure/tenancy/tenant-scope.storage';
import { AdminUserRecord, AdminUserSchema } from './admin-user.entity';
import { MongoAdminUserRepository } from './mongo-admin-user.repository';

/** Runs the shared port contract against MongoDB (`npm run test:int`). */
describe('MongoAdminUserRepository', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeAdminUserRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(AdminUserRecord.name, AdminUserSchema);
    await model.init();
    const repo = new MongoAdminUserRepository(model);
    const otherBusiness = new Types.ObjectId().toHexString();
    return {
      reader: repo,
      writer: repo,
      inOtherBusiness: (fn) =>
        tenantScopeStorage.run({ tenantId: otherBusiness, slug: 'other' }, fn),
    };
  });

  it('stores the business on every account and keeps the hash out of the model', async () => {
    await clearTestCollections(connection);
    const model = connection.model(AdminUserRecord.name, AdminUserSchema);
    await model.init();
    const repo = new MongoAdminUserRepository(model);
    const created = await repo.create({
      email: 'ana@example.com',
      name: 'Ana',
      passwordHash: 'hash',
      role: 'owner',
      createdAt: new Date(),
    });
    const raw = await connection
      .collection('admin_users')
      .findOne({ email: 'ana@example.com' });
    expect(raw?.tenantId).toBeInstanceOf(Types.ObjectId);
    expect(raw?.passwordHash).toBe('hash');
    expect(created).not.toHaveProperty('passwordHash');
  });
});
