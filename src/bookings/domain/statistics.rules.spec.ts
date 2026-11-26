import { buildStatistics, utcDateOf } from './statistics.rules';

describe('statistics rules', () => {
  it('uses the UTC calendar date as today, whatever the local zone', () => {
    expect(utcDateOf(new Date('2026-11-25T23:59:59Z'))).toBe('2026-11-25');
    expect(utcDateOf(new Date('2026-11-26T00:00:00Z'))).toBe('2026-11-26');
  });

  it('keeps the totals and reads an empty revenue as zero', () => {
    expect(buildStatistics(10, 5000, 2)).toEqual({
      totalBookings: 10,
      totalRevenue: 5000,
      todayBookings: 2,
    });
    expect(buildStatistics(0, 0, 0).totalRevenue).toBe(0);
    expect(buildStatistics(0, NaN, 0).totalRevenue).toBe(0);
  });
});
