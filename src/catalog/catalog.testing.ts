/**
 * Test-only in-memory stand-ins for the catalog Mongoose models. They emulate
 * just the query surface the catalog code uses (equality and `$in` filters,
 * `$set` / `$setOnInsert`, upsert) so specs never need a database.
 */
import { Model } from 'mongoose';
import { CatalogService } from './catalog.service';

type Doc = Record<string, any>;
type Filter = Record<string, any>;

const valueAt = (doc: Doc, path: string): unknown =>
  path.split('.').reduce<unknown>((value, part) => {
    if (value == null) return value;
    // A path through an array reads the field of every element, like Mongo.
    return Array.isArray(value)
      ? value.map((item: Doc) => item?.[part] as unknown)
      : (value as Doc)[part];
  }, doc);

/**
 * Equality (a scalar also matches an array containing it, like Mongo), `$in`,
 * `$gte` and `$ne` are honoured, on dotted paths too; any other operator
 * object matches all.
 */
const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, expected]) => {
    const actual = valueAt(doc, key);
    if (expected !== null && typeof expected === 'object') {
      const ops = expected as { $in?: unknown[]; $gte?: string; $ne?: unknown };
      if (ops.$in) {
        return ops.$in.includes(actual);
      }
      if (ops.$gte !== undefined || ops.$ne !== undefined) {
        return (
          (ops.$gte === undefined || (actual as string) >= ops.$gte) &&
          (ops.$ne === undefined || actual !== ops.$ne)
        );
      }
      return true;
    }
    return Array.isArray(actual)
      ? actual.includes(expected)
      : actual === expected;
  });

/** Keeps Dates and binary data intact, like a real Mongo round trip. */
const clone = <T>(value: T): T => structuredClone(value);

/** Emulates the `-photo.data` projection; other projections are ignored. */
const project = <T>(value: T, projection: string): T => {
  if (projection !== '-photo.data') return value;
  const strip = (doc: Doc) => {
    const photo = doc?.photo as Doc | null | undefined;
    if (photo) delete photo.data;
  };
  if (Array.isArray(value)) value.forEach(strip);
  else if (value) strip(value as Doc);
  return value;
};

/** Thenable-free query double: `.sort().select().lean().exec()` in any order. */
const query = <T>(run: () => T) => {
  let projection = '';
  const chain = {
    sort: () => chain,
    lean: () => chain,
    select: (spec: string) => {
      projection = spec;
      return chain;
    },
    exec: () => Promise.resolve(project(run(), projection)),
  };
  return chain;
};

export interface FakeModel {
  docs: Doc[];
  find: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
  deleteOne: jest.Mock;
  countDocuments: jest.Mock;
  exists: jest.Mock;
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
    countDocuments: jest.fn((filter: Filter = {}) =>
      query(() => docs.filter((doc) => matches(doc, filter)).length),
    ),
    exists: jest.fn((filter: Filter) =>
      query(() => (docs.some((doc) => matches(doc, filter)) ? {} : null)),
    ),
    deleteOne: jest.fn((filter: Filter) =>
      query(() => {
        const index = docs.findIndex((doc) => matches(doc, filter));
        if (index >= 0) docs.splice(index, 1);
        return { deletedCount: index >= 0 ? 1 : 0 };
      }),
    ),
    /** Only `$pull` of a scalar from a top-level array field. */
    updateMany: jest.fn((filter: Filter, update: Doc) =>
      query(() => {
        const targets = docs.filter((doc) => matches(doc, filter));
        for (const target of targets) {
          for (const [field, value] of Object.entries(
            (update.$pull ?? {}) as Doc,
          )) {
            target[field] = (target[field] as unknown[]).filter(
              (item) => item !== value,
            );
          }
        }
        return { modifiedCount: targets.length };
      }),
    ),
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
  bookings?: Doc[];
}) {
  const professionalModel = createFakeModel(initial?.professionals);
  const serviceModel = createFakeModel(initial?.services);
  const settingsModel = createFakeModel(initial?.settings);
  const bookingModel = createFakeModel(initial?.bookings);
  const catalog = new CatalogService(
    professionalModel,
    serviceModel,
    settingsModel,
  );
  return {
    catalog,
    professionalModel,
    serviceModel,
    settingsModel,
    bookingModel,
  };
}

/** A CatalogService already seeded with the defaults of catalog.config.ts. */
export async function createSeededCatalogService(): Promise<CatalogService> {
  const { catalog } = createFakeCatalog();
  await catalog.onModuleInit();
  return catalog;
}
