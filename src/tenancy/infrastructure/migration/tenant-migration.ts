/* eslint-disable @typescript-eslint/no-unsafe-assignment -- the migration reads the raw collections, whose documents are untyped */
// ===== MIGRACIÓN DE NEGOCIOS =====
// The one-off migration of spec 18, idempotent and with a mode of test:
//
//   1. it creates the default business ("principal") when there is none;
//   2. it fills `tenantId` on the documents of the six shared collections
//      that do not have it;
//   3. it drops the old unique indexes and creates the new ones, which start
//      with `tenantId`.
//
// It writes with the raw driver, inside the explicit `unscoped` escape: the
// documents it touches belong to no business yet.

import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { unscoped } from '../../../shared/infrastructure/tenancy/unscoped';

/** The slug of the default business. */
export const DEFAULT_TENANT_SLUG = 'principal';

/** The name of the default business. */
export const DEFAULT_TENANT_NAME = 'Principal';

/** The collections whose documents belong to a business. */
export const SCOPED_COLLECTIONS = [
  'professionals',
  'services',
  'locations',
  'business_settings',
  'branding',
  'bookings',
] as const;

/** The name of the unique index that keeps a confirmed booking alone. */
export const SLOT_INDEX_NAME = 'uniq_confirmed_professional_date_slot';

interface IndexPlan {
  collection: string;
  /** The old index, removed so two businesses may share an id. */
  drop?: Record<string, 1>;
  /** The new index, which starts with the business. */
  create: {
    key: Record<string, 1 | -1 | 'text'>;
    options?: {
      unique?: boolean;
      name?: string;
      partialFilterExpression?: Record<string, unknown>;
    };
  };
}

const SLOT_PARTIAL_FILTER = {
  status: 'confirmed',
  slots: { $exists: true },
};

/** The indexes the migration replaces. */
export const INDEX_PLANS: readonly IndexPlan[] = [
  {
    collection: 'professionals',
    drop: { id: 1 },
    create: { key: { tenantId: 1, id: 1 }, options: { unique: true } },
  },
  {
    collection: 'services',
    drop: { id: 1 },
    create: { key: { tenantId: 1, id: 1 }, options: { unique: true } },
  },
  {
    collection: 'locations',
    drop: { id: 1 },
    create: { key: { tenantId: 1, id: 1 }, options: { unique: true } },
  },
  {
    collection: 'business_settings',
    drop: { key: 1 },
    create: { key: { tenantId: 1, key: 1 }, options: { unique: true } },
  },
  {
    collection: 'branding',
    drop: { key: 1 },
    create: { key: { tenantId: 1, key: 1 }, options: { unique: true } },
  },
  {
    collection: 'bookings',
    drop: { 'professional.id': 1, date: 1, slots: 1 },
    create: {
      key: { tenantId: 1, 'professional.id': 1, date: 1, slots: 1 },
      options: {
        name: SLOT_INDEX_NAME,
        unique: true,
        partialFilterExpression: SLOT_PARTIAL_FILTER,
      },
    },
  },
  {
    collection: 'bookings',
    create: { key: { tenantId: 1, date: 1 } },
  },
];

/** What the migration did, or would do in the mode of test. */
export interface TenantMigrationReport {
  /** Whether the report is of a run that wrote nothing. */
  dryRun: boolean;
  /** The default business and what the run did with it. */
  defaultTenant: {
    id: string;
    slug: string;
    /** The business was created (or would be created). */
    created: boolean;
    /** An existing business became the default one (or would). */
    promoted: boolean;
  };
  /** How many documents of each collection would get (or got) their business. */
  filled: { collection: string; count: number }[];
  /** The indexes removed and created, per collection. */
  indexes: { collection: string; dropped: string[]; created: string[] }[];
  /** Whether the run wrote (or would write) anything. */
  changed: boolean;
}

const sameKey = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
};

/**
 * The migration of the business. It is idempotent: running it twice changes
 * nothing the second time.
 */
export class TenantMigration {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async run(
    options: { dryRun?: boolean } = {},
  ): Promise<TenantMigrationReport> {
    const dryRun = options.dryRun === true;
    return unscoped('the migration of the businesses', () =>
      this.migrate(dryRun),
    );
  }

  private async migrate(dryRun: boolean): Promise<TenantMigrationReport> {
    const defaultTenant = await this.ensureDefaultTenant(dryRun);
    const filled = await this.fillTenants(defaultTenant.id, dryRun);
    const indexes = await this.replaceIndexes(dryRun);
    const changed =
      defaultTenant.created ||
      defaultTenant.promoted ||
      filled.some((entry) => entry.count > 0) ||
      indexes.some(
        (entry) => entry.dropped.length > 0 || entry.created.length > 0,
      );
    return {
      dryRun,
      defaultTenant,
      filled,
      indexes,
      changed,
    };
  }

  /** The default business, created when the installation has none. */
  private async ensureDefaultTenant(dryRun: boolean): Promise<{
    id: string;
    slug: string;
    created: boolean;
    promoted: boolean;
  }> {
    const tenants = this.connection.collection('tenants');
    const existing = await tenants.findOne({ isDefault: true });
    if (existing) {
      return {
        id: String(existing._id),
        slug: existing.slug,
        created: false,
        promoted: false,
      };
    }
    const named = await tenants.findOne({ slug: DEFAULT_TENANT_SLUG });
    if (named) {
      if (!dryRun) {
        await tenants.updateOne(
          { _id: named._id },
          { $set: { isDefault: true } },
        );
      }
      return {
        id: String(named._id),
        slug: named.slug,
        created: false,
        promoted: true,
      };
    }
    if (dryRun) {
      return {
        id: '(it would be created)',
        slug: DEFAULT_TENANT_SLUG,
        created: true,
        promoted: false,
      };
    }
    const inserted = await tenants.insertOne({
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      status: 'active',
      isDefault: true,
      createdAt: new Date(),
    });
    return {
      id: String(inserted.insertedId),
      slug: DEFAULT_TENANT_SLUG,
      created: true,
      promoted: false,
    };
  }

  /** The documents of the six collections that do not have a business yet. */
  private async fillTenants(
    tenantId: string,
    dryRun: boolean,
  ): Promise<{ collection: string; count: number }[]> {
    const objectId = Types.ObjectId.isValid(tenantId)
      ? new Types.ObjectId(tenantId)
      : null;
    const report: { collection: string; count: number }[] = [];
    for (const name of SCOPED_COLLECTIONS) {
      const collection = this.connection.collection(name);
      const filter = {
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
      };
      const count = await collection.countDocuments(filter);
      if (count > 0 && !dryRun && objectId) {
        await collection.updateMany(filter, { $set: { tenantId: objectId } });
      }
      report.push({ collection: name, count });
    }
    return report;
  }

  /** The old indexes are dropped and the new ones created. */
  private async replaceIndexes(
    dryRun: boolean,
  ): Promise<{ collection: string; dropped: string[]; created: string[] }[]> {
    const byCollection = new Map<
      string,
      { dropped: string[]; created: string[] }
    >();
    for (const plan of INDEX_PLANS) {
      const entry = byCollection.get(plan.collection) ?? {
        dropped: [],
        created: [],
      };
      const collection = this.connection.collection(plan.collection);
      const indexes = await collection.indexes();

      if (plan.drop) {
        const old = indexes.find((index) => sameKey(index.key, plan.drop!));
        if (old) {
          entry.dropped.push(old.name);
          if (!dryRun) {
            await collection.dropIndex(old.name);
          }
        }
      }

      const wanted = plan.create.key;
      const exists = indexes.some(
        (index) =>
          sameKey(index.key, wanted) &&
          (!plan.create.options?.name ||
            index.name === plan.create.options.name),
      );
      if (!exists) {
        const name = plan.create.options?.name
          ? String(plan.create.options.name)
          : defaultIndexName(wanted);
        entry.created.push(name);
        if (!dryRun) {
          await collection.createIndex(
            wanted as never,
            (plan.create.options ?? {}) as never,
          );
        }
      }
      byCollection.set(plan.collection, entry);
    }
    return [...byCollection.entries()].map(([collection, entry]) => ({
      collection,
      ...entry,
    }));
  }
}

/** The name MongoDB gives to an index when none is given. */
const defaultIndexName = (key: Record<string, unknown>): string =>
  Object.entries(key)
    .map(([field, direction]) => `${field}_${String(direction)}`)
    .join('_');
