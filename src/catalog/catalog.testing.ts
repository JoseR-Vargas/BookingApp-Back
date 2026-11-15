/**
 * Test-only in-memory stand-ins for the catalog Mongoose models. They emulate
 * just the query surface the catalog code uses (equality and `$in` filters,
 * `$set` / `$setOnInsert`, upsert) so specs never need a database.
 */
import { Model } from 'mongoose';
import { CatalogService } from './catalog.service';

type Doc = Record<string, any>;
type Filter = Record<string, any>;

/** Equality and `$in` are honoured; any other operator object matches all. */
const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, expected]) => {
    if (expected !== null && typeof expected === 'object') {
      return '$in' in expected
        ? (expected.$in as unknown[]).includes(doc[key])
        : true;
    }
    return doc[key] === expected;
  });

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Thenable-free query double: `.sort().lean().exec()` in any combination. */
const query = <T>(run: () => T) => {
  const chain = {
    sort: () => chain,
    lean: () => chain,
    exec: () => Promise.resolve(run()),
  };
  return chain;
};

export interface FakeModel {
  docs: Doc[];
  find: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
}

export function createFakeModel(initial: Doc[] = []): FakeModel & Model<any> {
  const docs: Doc[] = clone(initial);

  const equalityOf = (filter: Filter): Doc =>
    Object.fromEntries(
      Object.entries(filter).filter(
        ([, value]) => value === null || typeof value !== 'object',
      ),
    );

  const apply = (target: Doc, update: Doc, inserting: boolean) => {
    Object.assign(target, clone(update.$set ?? {}));
    if (inserting) {
      Object.assign(target, clone(update.$setOnInsert ?? {}));
    }
  };

  const model: FakeModel = {
    docs,
    find: jest.fn((filter: Filter = {}) =>
      query(() => clone(docs.filter((doc) => matches(doc, filter)))),
    ),
    findOne: jest.fn((filter: Filter) =>
      query(() => clone(docs.find((doc) => matches(doc, filter)) ?? null)),
    ),
    findOneAndUpdate: jest.fn(
      (filter: Filter, update: Doc, options: Doc = {}) =>
        query(() => {
          let target = docs.find((doc) => matches(doc, filter));
          if (!target && options.upsert) {
            target = equalityOf(filter);
            docs.push(target);
            apply(target, update, true);
          } else if (target) {
            apply(target, update, false);
          }
          return clone(target ?? null);
        }),
    ),
    updateOne: jest.fn((filter: Filter, update: Doc, options: Doc = {}) =>
      query(() => {
        const target = docs.find((doc) => matches(doc, filter));
        if (target) {
          apply(target, update, false);
          return { upsertedCount: 0, modifiedCount: 1 };
        }
        if (options.upsert) {
          const created = equalityOf(filter);
          docs.push(created);
          apply(created, update, true);
          return { upsertedCount: 1, modifiedCount: 0 };
        }
        return { upsertedCount: 0, modifiedCount: 0 };
      }),
    ),
  };
  return model as unknown as FakeModel & Model<any>;
}

/** CatalogService over empty fake models; `onModuleInit` seeds them. */
export function createFakeCatalog(initial?: {
  professionals?: Doc[];
  services?: Doc[];
  settings?: Doc[];
}) {
  const professionalModel = createFakeModel(initial?.professionals);
  const serviceModel = createFakeModel(initial?.services);
  const settingsModel = createFakeModel(initial?.settings);
  const catalog = new CatalogService(
    professionalModel,
    serviceModel,
    settingsModel,
  );
  return { catalog, professionalModel, serviceModel, settingsModel };
}

/** A CatalogService already seeded with the defaults of catalog.config.ts. */
export async function createSeededCatalogService(): Promise<CatalogService> {
  const { catalog } = createFakeCatalog();
  await catalog.onModuleInit();
  return catalog;
}
