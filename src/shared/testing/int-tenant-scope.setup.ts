// Integration tests run inside a business, like a request does: the Mongoose
// plugin fails closed without one (spec 18). Jest does not carry an
// AsyncLocalStorage store from a hook into the tests, so each hook and test
// body is wrapped to run inside the business of the file.
import { TEST_TENANT_ID } from './test-tenant';
import { tenantScopeStorage } from '../infrastructure/tenancy/tenant-scope.storage';

type Fn = (...args: unknown[]) => unknown;

// One business per test file: hooks and tests of a file share it.
const tenantId = TEST_TENANT_ID.toHexString();

const inBusiness = (fn: Fn): Fn =>
  function (this: unknown, ...args: unknown[]) {
    return tenantScopeStorage.run({ tenantId, slug: 'int-test' }, () =>
      fn.apply(this, args),
    );
  };

const wrap = (original: Fn): Fn =>
  Object.assign(
    (name: unknown, fn?: Fn, timeout?: unknown) =>
      typeof fn === 'function'
        ? original(name, inBusiness(fn), timeout)
        : original(name, fn, timeout),
    original,
  );

const g = globalThis as unknown as Record<string, Fn>;
for (const key of [
  'it',
  'test',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
]) {
  const original = g[key];
  if (key === 'it' || key === 'test') {
    const wrapped = ((name: unknown, fn?: Fn, timeout?: unknown) =>
      typeof fn === 'function'
        ? original(name, inBusiness(fn), timeout)
        : original(name, fn, timeout)) as Fn & Record<string, unknown>;
    Object.assign(wrapped, original);
    g[key] = wrapped;
  } else {
    g[key] = wrap(original);
  }
}
