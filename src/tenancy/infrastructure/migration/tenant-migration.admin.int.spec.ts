import { Connection } from 'mongoose';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../shared/testing/mongo-test-connection';
import { TenantMigration } from './tenant-migration';

/** The migration keeps the admin accounts and sessions tenant-first (spec 20). */
describe('TenantMigration: admin collections', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await clearTestCollections(connection);
    await closeTestMongo(connection);
  });

  it('creates the tenant-first indexes and the TTL index, and is idempotent', async () => {
    await clearTestCollections(connection);
    await connection.dropCollection('admin_users').catch(() => undefined);
    await connection.dropCollection('admin_sessions').catch(() => undefined);
    const migration = new TenantMigration(connection);

    await migration.run();
    const second = await migration.run();

    const users = await connection.collection('admin_users').indexes();
    expect(
      users.find((i) => i.key.tenantId === 1 && i.key.email === 1)?.unique,
    ).toBe(true);
    expect(users.some((i) => i.key.tenantId === 1 && i.key.role === 1)).toBe(
      true,
    );
    const sessions = await connection.collection('admin_sessions').indexes();
    expect(
      sessions.find((i) => i.key.tenantId === 1 && i.key.tokenHash === 1)
        ?.unique,
    ).toBe(true);
    expect(
      sessions.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds,
    ).toBe(0);
    expect(second.changed).toBe(false);
  });
});
