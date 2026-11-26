import { Connection, Types } from 'mongoose';
import { describePaymentEventLogContract } from '../../../application/ports/payment-event-log.contract';
import { describeSubscriptionRepositoryContract } from '../../../application/ports/subscription-repository.contract';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../../../shared/testing/mongo-test-connection';
import { tenantScopeStorage } from '../../../../shared/infrastructure/tenancy/tenant-scope.storage';
import { TEST_TENANT_ID } from '../../../../shared/testing/test-tenant';
import { MongoPaymentEventLog } from './mongo-payment-event.log';
import { MongoPlanUsageReader } from './mongo-plan-usage.reader';
import { MongoSubscriptionRepository } from './mongo-subscription.repository';
import { PaymentEventRecord, PaymentEventSchema } from './payment-event.entity';
import { SubscriptionRecord, SubscriptionSchema } from './subscription.entity';

/** Runs the port contracts against MongoDB (`npm run test:int`). */
describe('billing Mongo adapters', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  describeSubscriptionRepositoryContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(SubscriptionRecord.name, SubscriptionSchema);
    await model.init();
    const repo = new MongoSubscriptionRepository(model);
    const otherBusiness = new Types.ObjectId().toHexString();
    return {
      reader: repo,
      writer: repo,
      inOtherBusiness: (fn) =>
        tenantScopeStorage.run({ tenantId: otherBusiness, slug: 'other' }, fn),
    };
  });

  describePaymentEventLogContract('MongoDB', async () => {
    await clearTestCollections(connection);
    const model = connection.model(PaymentEventRecord.name, PaymentEventSchema);
    await model.init();
    return new MongoPaymentEventLog(model);
  });

  it('subscriptions: a unique tenant-first index and a tenant-first status index; payment_events: unique external id', async () => {
    await connection.model(SubscriptionRecord.name, SubscriptionSchema).init();
    await connection.model(PaymentEventRecord.name, PaymentEventSchema).init();
    const subs = await connection.collection('subscriptions').indexes();
    const byTenant = subs.find((i) => Object.keys(i.key).join() === 'tenantId');
    expect(byTenant?.unique).toBe(true);
    expect(
      subs.some((i) => Object.keys(i.key).join() === 'tenantId,status'),
    ).toBe(true);
    const events = await connection.collection('payment_events').indexes();
    const byId = events.find((i) => i.key.externalEventId === 1);
    expect(byId?.unique).toBe(true);
  });

  it('refuses a second subscription of the same business at the database', async () => {
    await clearTestCollections(connection);
    const model = connection.model(SubscriptionRecord.name, SubscriptionSchema);
    await model.init();
    const doc = {
      tenantId: TEST_TENANT_ID,
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.collection('subscriptions').insertOne({ ...doc });
    await expect(
      connection.collection('subscriptions').insertOne({ ...doc }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  describe('MongoPlanUsageReader', () => {
    const otherBusiness = new Types.ObjectId();
    const reader = () =>
      new MongoPlanUsageReader(connection, {
        current: () => ({ id: TEST_TENANT_ID.toHexString(), slug: 'int-test' }),
      });

    it('counts only active professionals and locations, and bookings of the range, of the business in force', async () => {
      await clearTestCollections(connection);
      const professionals = connection.collection('professionals');
      await professionals.insertMany([
        { tenantId: TEST_TENANT_ID, id: 'a', active: true },
        { tenantId: TEST_TENANT_ID, id: 'b', active: false },
        { tenantId: otherBusiness, id: 'c', active: true },
      ]);
      await connection.collection('locations').insertMany([
        { tenantId: TEST_TENANT_ID, id: 'l1', active: true },
        { tenantId: TEST_TENANT_ID, id: 'l2', active: true },
        { tenantId: TEST_TENANT_ID, id: 'l3', active: false },
        { tenantId: otherBusiness, id: 'l4', active: true },
      ]);
      await connection.collection('bookings').insertMany([
        {
          tenantId: TEST_TENANT_ID,
          createdAt: new Date('2026-11-02T00:00:00Z'),
          status: 'confirmed',
        },
        {
          tenantId: TEST_TENANT_ID,
          createdAt: new Date('2026-11-30T23:59:59Z'),
          status: 'cancelled',
        },
        {
          tenantId: TEST_TENANT_ID,
          createdAt: new Date('2026-10-31T23:59:59Z'),
          status: 'confirmed',
        },
        {
          tenantId: TEST_TENANT_ID,
          createdAt: new Date('2026-12-01T00:00:00Z'),
          status: 'confirmed',
        },
        {
          tenantId: otherBusiness,
          createdAt: new Date('2026-11-05T00:00:00Z'),
          status: 'confirmed',
        },
      ]);

      expect(await reader().countProfessionals()).toBe(1);
      expect(await reader().countLocations()).toBe(2);
      expect(
        await reader().countBookings({
          start: new Date('2026-11-01T00:00:00Z'),
          end: new Date('2026-12-01T00:00:00Z'),
        }),
      ).toBe(2);
    });
  });
});
