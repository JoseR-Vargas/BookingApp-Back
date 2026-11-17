/**
 * Test-only in-memory stand-in for the branding Mongoose model. It emulates
 * just the query surface BrandingService uses (`findOne` and an upserting
 * `findOneAndUpdate` with `$set` / `$setOnInsert`). `structuredClone` keeps
 * Dates and binary data, which the JSON clone of catalog.testing.ts would not.
 */
import { Model } from 'mongoose';
import { BrandingService, PublicBranding } from './branding.service';
import { BrandingRecord } from './schemas/branding.schema';

type Doc = Record<string, any>;

const matches = (doc: Doc, filter: Doc): boolean =>
  Object.entries(filter).every(([key, value]) => doc[key] === value);

const query = <T>(run: () => T) => {
  const chain = {
    lean: () => chain,
    exec: () => Promise.resolve(run()),
  };
  return chain;
};

/** A stored document as the fake keeps it. */
export type StoredBranding = Partial<BrandingRecord>;

/** Typed JSON body of a branding response (or a Nest error body). */
export type BrandingResponseBody = PublicBranding & { message?: string };

export const bodyOf = (res: { body: unknown }): BrandingResponseBody =>
  res.body as BrandingResponseBody;

export interface FakeBrandingModel {
  docs: StoredBranding[];
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
}

export function createFakeBrandingModel(
  initial: Doc[] = [],
): FakeBrandingModel & Model<BrandingRecord> {
  const docs: StoredBranding[] = structuredClone(initial);

  const model: FakeBrandingModel = {
    docs,
    findOne: jest.fn((filter: Doc) =>
      query(() =>
        structuredClone(docs.find((d) => matches(d, filter)) ?? null),
      ),
    ),
    findOneAndUpdate: jest.fn((filter: Doc, update: Doc, options: Doc = {}) =>
      query(() => {
        let target = docs.find((d) => matches(d, filter));
        const inserting = !target && options.upsert === true;
        if (inserting) {
          target = { ...filter };
          docs.push(target);
        }
        if (!target) return null;
        Object.assign(target, structuredClone(update.$set ?? {}));
        if (inserting) {
          Object.assign(target, structuredClone(update.$setOnInsert ?? {}));
        }
        return structuredClone(target);
      }),
    ),
  };
  return model as unknown as FakeBrandingModel & Model<BrandingRecord>;
}

/** BrandingService over a fake model, optionally pre-filled. */
export function createFakeBranding(initial?: Doc[]) {
  const model = createFakeBrandingModel(initial);
  return { model, service: new BrandingService(model) };
}
