import { TenantContext } from '../../../shared/application/tenant-context.port';
import { LocatedAvailability } from '../../domain/availability';
import { InMemoryAvailabilityCache } from './in-memory-availability.cache';

const day = (date: string): LocatedAvailability => ({
  date,
  closed: false,
  location: { id: 'principal', name: 'Principal' },
  services: [],
  totalDuration: 30,
  professionals: [{ id: 'alex', name: 'Alex', slots: ['09:00'] }],
});

describe('InMemoryAvailabilityCache', () => {
  let now: number;
  let tenant: string;
  const context: TenantContext = {
    current: () => ({ id: tenant, slug: tenant }),
  };
  const build = (ttlMs = 60_000) =>
    new InMemoryAvailabilityCache({ now: () => new Date(now) }, context, ttlMs);
  const key = { date: '2026-10-19', serviceIds: ['a'], locationId: 'centro' };

  beforeEach(() => {
    now = Date.parse('2026-11-26T10:00:00Z');
    tenant = 'tenant-1';
  });

  it('hits inside the TTL and misses after it', () => {
    const cache = build();
    cache.set(key, day('2026-10-19'), cache.stamp());

    expect(cache.get(key)).toEqual(day('2026-10-19'));
    now += 59_999;
    expect(cache.get(key)).toBeDefined();
    now += 1;
    expect(cache.get(key)).toBeUndefined();
  });

  it('keys the answer by date, service ids (ordered) and location', () => {
    const cache = build();
    cache.set(key, day('2026-10-19'), cache.stamp());

    expect(cache.get({ ...key, date: '2026-10-20' })).toBeUndefined();
    expect(cache.get({ ...key, serviceIds: ['a', 'b'] })).toBeUndefined();
    expect(cache.get({ ...key, locationId: 'norte' })).toBeUndefined();
    expect(cache.get({ ...key, locationId: undefined })).toBeUndefined();
    cache.set({ ...key, serviceIds: ['a', 'b'] }, day('x'), cache.stamp());
    expect(cache.get({ ...key, serviceIds: ['b', 'a'] })).toBeUndefined();
  });

  it('never shares entries across businesses', () => {
    const cache = build();
    cache.set(key, day('2026-10-19'), cache.stamp());

    tenant = 'tenant-2';
    expect(cache.get(key)).toBeUndefined();
    cache.set(key, day('other'), cache.stamp());
    expect(cache.get(key)?.date).toBe('other');

    tenant = 'tenant-1';
    expect(cache.get(key)?.date).toBe('2026-10-19');
  });

  it('invalidates only the business in force', () => {
    const cache = build();
    cache.set(key, day('1'), cache.stamp());
    tenant = 'tenant-2';
    cache.set(key, day('2'), cache.stamp());

    cache.invalidateBusiness();

    expect(cache.get(key)).toBeUndefined();
    tenant = 'tenant-1';
    expect(cache.get(key)?.date).toBe('1');
  });

  it('drops an answer computed before an invalidation', () => {
    const cache = build();
    const stamp = cache.stamp();
    cache.invalidateBusiness(); // a booking landed while the answer was computed

    cache.set(key, day('stale'), stamp);

    expect(cache.get(key)).toBeUndefined();
  });

  it('hands out copies: a caller cannot corrupt the cached answer', () => {
    const cache = build();
    cache.set(key, day('1'), cache.stamp());
    cache.get(key)!.professionals[0].slots.push('23:00');

    expect(cache.get(key)!.professionals[0].slots).toEqual(['09:00']);
  });

  it('with a TTL of 0 stores nothing', () => {
    const cache = build(0);
    cache.set(key, day('1'), cache.stamp());
    expect(cache.get(key)).toBeUndefined();
  });

  it('purges expired entries so memory stays bounded', () => {
    const cache = build();
    for (let i = 0; i < 20; i++) {
      cache.set({ ...key, date: `d${i}` }, day('x'), cache.stamp());
    }
    now += 61_000;
    cache.set(key, day('fresh'), cache.stamp());

    expect(cache.size()).toBe(1);
  });
});
