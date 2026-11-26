import { PlatformMetrics } from '../../domain/platform-metrics';
import { InMemoryPlatformMetricsCache } from './in-memory-platform-metrics.cache';

const metrics = (generatedAt: Date): PlatformMetrics => ({
  businesses: { total: 3, active: 2, inTrial: 1, suspended: 1 },
  bookings: { today: 5, thisMonth: 40 },
  estimatedRevenueByPlan: [{ planId: 'pro', subscriptions: 2 }],
  generatedAt,
});

describe('InMemoryPlatformMetricsCache (spec 25)', () => {
  let now: number;
  const build = (ttlMs = 60_000) =>
    new InMemoryPlatformMetricsCache({ now: () => new Date(now) }, ttlMs);

  beforeEach(() => {
    now = Date.parse('2026-11-26T10:00:00.000Z');
  });

  it('has nothing before the first set', () => {
    expect(build().get()).toBeNull();
  });

  it('hits inside the live time and misses after it', () => {
    const cache = build();
    cache.set(metrics(new Date(now)));

    expect(cache.get()?.metrics.businesses.total).toBe(3);
    now += 59_999;
    expect(cache.get()).not.toBeNull();
    now += 1;
    expect(cache.get()).toBeNull();
  });

  it('says when the metrics expire', () => {
    const cache = build();

    const entry = cache.set(metrics(new Date(now)));

    expect(entry.expiresAt).toEqual(new Date(now + 60_000));
  });

  it('with a live time of zero stores nothing', () => {
    const cache = build(0);
    cache.set(metrics(new Date(now)));

    expect(cache.get()).toBeNull();
  });

  it('drops the expired entry so the memory stays bounded', () => {
    const cache = build();
    cache.set(metrics(new Date(now)));
    now += 60_001;

    expect(cache.get()).toBeNull();
  });
});
