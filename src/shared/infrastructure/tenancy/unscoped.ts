// ===== ESCAPE EXPRESO (UNSCOPED) =====
// The only way to read or write the data of every business. It exists for
// four operations and no more (spec 18, spec 25):
//
//   1. the migration and the scripts;
//   2. the lookup of a booking by its cancel token, which then continues
//      inside the business that owns it;
//   3. the resolution of the business itself (the `tenants` collection has no
//      `tenantId`);
//   4. the panel of the owner of the system (spec 25): it reads across
//      businesses because it is the owner of the installation.
//
// The reason is mandatory: the escape is auditable, and a test fails when a
// new one appears outside that list.

import { tenantScopeStorage } from './tenant-scope.storage';

/**
 * Runs `fn` without a business: its queries are not filtered.
 *
 * @param reason why the escape is needed. It says which of the three
 * operations above it is.
 */
export function unscoped<T>(reason: string, fn: () => T): T {
  if (reason.trim() === '') {
    throw new Error('An unscoped escape must say why it is needed.');
  }
  const scope = tenantScopeStorage.getStore();
  return tenantScopeStorage.run(
    { ...(scope ?? {}), tenantId: undefined, unscopedReason: reason },
    fn,
  );
}
