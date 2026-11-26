import { tenantScopeStorage } from './tenant-scope.storage';

/** Runs `fn` inside the business `tenantId` (test helper for in-memory adapters). */
export function inTenant<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantScopeStorage.run({ tenantId, slug: tenantId }, fn);
}
