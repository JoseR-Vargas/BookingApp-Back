import { Connection, Model, Types } from 'mongoose';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../../testing/mongo-test-connection';
import {
  ServiceRecord,
  ServiceSchema,
} from '../../../catalog/infrastructure/persistence/mongo/service.entity';
import { tenantScopeStorage } from '../tenancy/tenant-scope.storage';
import { unscoped } from '../tenancy/unscoped';

const A = new Types.ObjectId().toHexString();
const B = new Types.ObjectId().toHexString();
const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
  tenantScopeStorage.run({ tenantId, slug: tenantId }, fn);

const service = (id: string, name = id) => ({
  id,
  name,
  description: '',
  price: 1,
  duration: 30,
  professionals: [],
  icon: 'x',
  active: true,
});

describe('tenantScope plugin (real Mongo)', () => {
  let connection: Connection;
  let model: Model<ServiceRecord>;

  beforeAll(async () => {
    connection = await connectTestMongo();
    model = connection.model<ServiceRecord>(ServiceRecord.name, ServiceSchema);
    await model.init();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
  });

  beforeEach(async () => {
    await clearTestCollections(connection);
    await asTenant(A, () => model.create(service('corte', 'A corte')));
    await asTenant(B, () => model.create(service('corte', 'B corte')));
    await asTenant(B, () => model.create(service('barba', 'B barba')));
  });

  it('stamps the business on save and lets two businesses share an id', async () => {
    const stored = await unscoped('test', () =>
      model.find({ id: 'corte' }).lean().exec(),
    );
    expect(stored).toHaveLength(2);
    expect(stored.map((d) => String(d.tenantId)).sort()).toEqual([A, B].sort());
  });

  it('find, findOne, countDocuments, distinct and exists only see the own business', async () => {
    await asTenant(A, async () => {
      expect(await model.find().exec()).toHaveLength(1);
      expect((await model.findOne({ id: 'corte' }).exec())?.name).toBe(
        'A corte',
      );
      expect(await model.findOne({ id: 'barba' }).exec()).toBeNull();
      expect(await model.countDocuments().exec()).toBe(1);
      expect(await model.distinct('id').exec()).toEqual(['corte']);
      expect(await model.exists({ id: 'barba' }).exec()).toBeNull();
    });
  });

  it('updates and deletes never touch the other business', async () => {
    await asTenant(A, async () => {
      await model.updateMany({}, { $set: { price: 99 } }).exec();
      await model.findOneAndUpdate({ id: 'barba' }, { price: 7 }).exec();
      await model.deleteMany({ id: 'barba' }).exec();
      await model.deleteOne({ id: 'barba' }).exec();
    });
    await asTenant(B, async () => {
      const docs = await model.find().lean().exec();
      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.price === 1)).toBe(true);
    });
  });

  it('an upsert creates the document in the own business', async () => {
    await asTenant(A, () =>
      model
        .updateOne(
          { id: 'tinte' },
          { $setOnInsert: service('tinte') },
          { upsert: true },
        )
        .exec(),
    );
    await asTenant(B, async () =>
      expect(await model.findOne({ id: 'tinte' }).exec()).toBeNull(),
    );
    await asTenant(A, async () =>
      expect(await model.findOne({ id: 'tinte' }).exec()).not.toBeNull(),
    );
  });

  it('aggregate is filtered by the business', async () => {
    await asTenant(B, async () => {
      const rows = await model
        .aggregate<{ n: number }>([{ $count: 'n' }])
        .exec();
      expect(rows[0].n).toBe(2);
    });
  });

  it('insertMany stamps every document', async () => {
    await asTenant(A, () => model.insertMany([service('uno'), service('dos')]));
    await asTenant(B, async () =>
      expect(await model.find({ id: { $in: ['uno', 'dos'] } }).exec()).toEqual(
        [],
      ),
    );
  });

  it('a query that names another business throws', async () => {
    await asTenant(A, async () => {
      await expect(model.find({ tenantId: B }).exec()).rejects.toThrow();
    });
  });

  it('fails closed without any business in the context', async () => {
    await tenantScopeStorage.exit(async () => {
      await expect(model.find().exec()).rejects.toThrow(/no business/);
    });
  });

  it('the unscoped escape sees every business', async () => {
    const all = await unscoped('test', () => model.find().exec());
    expect(all).toHaveLength(3);
  });
});
