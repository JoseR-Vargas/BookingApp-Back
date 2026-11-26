// ===== ALMACÉN DEL CONTEXTO DE NEGOCIO =====
// Where the business in force is kept while a request runs. It is an
// `AsyncLocalStorage`, so it travels with the promises of the request and
// disappears when the request ends.

import { AsyncLocalStorage } from 'node:async_hooks';

/** What is in force right now. */
export interface TenantScopeState {
  /** The business of the request, as a hex string. Absent outside a request. */
  tenantId?: string;
  /** The slug the request named. */
  slug?: string;
  /** Whether the business is the default one. */
  isDefault?: boolean;
  /**
   * The reason of the `unscoped` escape in force, if any. While it is set
   * the queries are NOT filtered by business.
   */
  unscopedReason?: string;
}

/** The one storage of the process. */
export const tenantScopeStorage = new AsyncLocalStorage<TenantScopeState>();

/** The scope in force, or undefined outside a request. */
export function currentScope(): TenantScopeState | undefined {
  return tenantScopeStorage.getStore();
}

/** The business in force, or undefined outside a request. */
export function currentTenantId(): string | undefined {
  return tenantScopeStorage.getStore()?.tenantId;
}

/** Whether an `unscoped` escape is in force right now. */
export function isUnscoped(): boolean {
  return currentScope()?.unscopedReason !== undefined;
}
