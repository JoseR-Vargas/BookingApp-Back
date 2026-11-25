/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- the Mongoose pre-hooks receive an untyped `this` (the query or the document) */
// ===== PLUGIN DE AISLAMIENTO POR NEGOCIO (tenantScope) =====
// Every document of the six shared collections belongs to a business, and
// every query of those collections is filtered by the business in force
// (spec 18).
//
// The filter is applied HERE, in the infrastructure, and not in each
// repository: a repository that forgets the filter would be a leak, and the
// plugin cannot be forgotten.
//
// It fails closed: a query without a business in the context is an error, not
// "the data of every business". The only way out is the explicit `unscoped`
// escape, whose list of uses is closed and checked by a test.

import { Schema, Types } from 'mongoose';
import { TenantContextError } from '../../application/tenant-context.port';
import { currentScope } from '../tenancy/tenant-scope.storage';

/** The field that says which business a document belongs to. */
export const TENANT_FIELD = 'tenantId';

/** The query operations the plugin filters. */
export const SCOPED_QUERY_OPERATIONS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'distinct',
  'exists',
] as const;

const HEX_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** The business in force, or undefined when an `unscoped` escape is open. */
interface Scope {
  tenantId: string;
}

const noScope = (): Scope | undefined => {
  const scope = currentScope();
  if (!scope) return undefined;
  if (scope.unscopedReason !== undefined) return undefined;
  if (!scope.tenantId) {
    throw new TenantContextError(
      'There is no business in the context: the query would read the data of every business.',
    );
  }
  return { tenantId: scope.tenantId };
};

/** The business id as the `ObjectId` the documents store. */
const toObjectId = (tenantId: string): Types.ObjectId => {
  if (!HEX_OBJECT_ID.test(tenantId)) {
    throw new TenantContextError(
      `The business id "${tenantId}" is not an ObjectId, so it can never match a document.`,
    );
  }
  return new Types.ObjectId(tenantId);
};

/** Whether a value names the business in force. */
const isSameTenant = (value: unknown, tenantId: string): boolean =>
  value instanceof Types.ObjectId
    ? value.toHexString() === tenantId.toLowerCase()
    : String(value) === tenantId;

/**
 * The filter with the business in force added to it. A filter that names
 * another business is an error: it would read (or write) the data of a
 * business the request does not belong to.
 */
export function scopedFilter(
  filter: Record<string, unknown>,
  scope: Scope,
): Record<string, unknown> {
  const existing = filter?.[TENANT_FIELD];
  if (existing !== undefined && existing !== null) {
    if (!isSameTenant(existing, scope.tenantId)) {
      throw new TenantContextError(
        `The query names the business "${String(existing as string | number | boolean)}", but the request belongs to "${scope.tenantId}".`,
      );
    }
    return { ...filter, [TENANT_FIELD]: toObjectId(scope.tenantId) };
  }
  return { ...filter, [TENANT_FIELD]: toObjectId(scope.tenantId) };
}

/** Whether an update document is a replacement (no operators) or an update. */
const isReplacement = (update: Record<string, unknown>): boolean =>
  !Object.keys(update).some((key) => key.startsWith('$'));

/**
 * The update document with the business in force stamped on it. A document
 * that names another business is an error.
 */
export function scopedUpdate(
  update: Record<string, unknown>,
  scope: Scope,
  options: { upsert?: boolean } = {},
): Record<string, unknown> {
  if (!update || typeof update !== 'object') return update;

  if (isReplacement(update)) {
    const existing = update[TENANT_FIELD];
    if (
      existing !== undefined &&
      existing !== null &&
      !isSameTenant(existing, scope.tenantId)
    ) {
      throw new TenantContextError(
        `The update names the business "${String(existing as string | number | boolean)}", but the request belongs to "${scope.tenantId}".`,
      );
    }
    return { ...update, [TENANT_FIELD]: toObjectId(scope.tenantId) };
  }

  const stamped = { ...update };
  for (const operator of ['$set', '$setOnInsert']) {
    const fields = stamped[operator] as Record<string, unknown> | undefined;
    const existing = fields?.[TENANT_FIELD];
    if (
      existing !== undefined &&
      existing !== null &&
      !isSameTenant(existing, scope.tenantId)
    ) {
      throw new TenantContextError(
        `The update names the business "${String(existing as string | number | boolean)}", but the request belongs to "${scope.tenantId}".`,
      );
    }
  }
  if (options.upsert && stamped.$setOnInsert) {
    stamped.$setOnInsert = {
      ...(stamped.$setOnInsert as Record<string, unknown>),
      [TENANT_FIELD]: toObjectId(scope.tenantId),
    };
  }
  return stamped;
}

/** Stamps the business on a document that is about to be saved. */
export function stampDocument(
  document: {
    get(path: string): unknown;
    set(path: string, value: unknown): unknown;
  },
  scope: Scope,
): void {
  const existing = document.get(TENANT_FIELD);
  if (
    existing !== undefined &&
    existing !== null &&
    !isSameTenant(existing, scope.tenantId)
  ) {
    throw new TenantContextError(
      `The document belongs to the business "${String(existing as string | number | boolean)}", but the request belongs to "${scope.tenantId}".`,
    );
  }
  document.set(TENANT_FIELD, toObjectId(scope.tenantId));
}

/**
 * The plugin: it filters every query of the schema by the business in force
 * and stamps the business on every document it stores.
 */
export function tenantScopePlugin(schema: Schema): void {
  for (const operation of SCOPED_QUERY_OPERATIONS) {
    // The operation names are the ones Mongoose's pre-hooks accept; the union
    // is narrowed here so the hook keeps its own type.
    schema.pre(operation as Parameters<Schema['pre']>[0], function (this: any) {
      const scope = noScope();
      if (!scope) return;
      const query = scopedFilter(this.getQuery() ?? {}, scope);
      this.setQuery(query);
      const update = this.getUpdate?.();
      if (update && typeof update === 'object') {
        const scoped = scopedUpdate(update, scope, this.getOptions?.() ?? {});
        this.setUpdate(scoped);
      }
    });
  }

  // The aggregation pipeline is filtered with a `$match` at the front.
  schema.pre('aggregate', function (this: any) {
    const scope = noScope();
    if (!scope) return;
    this.pipeline().unshift({ $match: scopedFilter({}, scope) });
  });

  // `save` (and therefore `create`) stamps the business on the document.
  schema.pre('save', function (this: any) {
    const scope = noScope();
    if (!scope) return;
    stampDocument(this, scope);
  });

  // `insertMany` stamps the business on every document of the batch.
  schema.pre('insertMany', function (this: any, first: any, second?: any) {
    const scope = noScope();
    const documents = [first, second].find((value) => Array.isArray(value)) as
      | Record<string, unknown>[]
      | undefined;
    if (!scope || !documents) return;
    for (const document of documents) {
      stampDocument(
        document as {
          get(path: string): unknown;
          set(path: string, value: unknown): void;
        },
        scope,
      );
    }
    // The middleware of Mongoose expects the callback to be called.
    const next = [first, second].find(
      (value) => typeof value === 'function',
    ) as (() => void) | undefined;
    next?.();
  });
}
