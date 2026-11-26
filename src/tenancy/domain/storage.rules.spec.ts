import {
  DEFAULT_STORAGE_QUOTA_BYTES,
  STORAGE_MEASUREMENT_TTL_MS,
  isMeasurementStale,
  storageLevelOf,
  storageStatusOf,
} from './storage.rules';

const MB = 1024 * 1024;
const NOW = new Date('2026-11-26T10:00:00Z');

describe('storage rules', () => {
  it('gives a new business 50 MB', () => {
    expect(DEFAULT_STORAGE_QUOTA_BYTES).toBe(50 * MB);
  });

  it.each([
    [0, 'ok'],
    [69, 'ok'],
    [70, 'warning'],
    [89, 'warning'],
    [90, 'critical'],
    [99, 'critical'],
    [100, 'blocked'],
    [250, 'blocked'],
  ])('%i%% of the quota is "%s"', (percent, level) => {
    expect(storageLevelOf(percent * 10, 1000)).toBe(level);
  });

  it('judges the exact ratio, not the rounded percent', () => {
    expect(storageLevelOf(699, 1000)).toBe('ok');
    expect(storageLevelOf(999, 1000)).toBe('critical');
  });

  it('is null for a business without a quota (no cap)', () => {
    expect(
      storageStatusOf({ storageQuotaBytes: null, storageUsedBytes: 5 * MB }),
    ).toBeNull();
  });

  it('shows used, quota, whole percent and level', () => {
    expect(
      storageStatusOf({
        storageQuotaBytes: 50 * MB,
        storageUsedBytes: 36 * MB,
      }),
    ).toEqual({
      usedBytes: 36 * MB,
      quotaBytes: 50 * MB,
      percent: 72,
      level: 'warning',
    });
  });

  it('treats a zero quota as full', () => {
    expect(
      storageStatusOf({ storageQuotaBytes: 0, storageUsedBytes: 0 }),
    ).toMatchObject({ percent: 100, level: 'blocked' });
  });

  describe('isMeasurementStale', () => {
    it('is stale when never measured', () => {
      expect(isMeasurementStale(null, NOW)).toBe(true);
    });
    it('is fresh for 10 minutes and stale after', () => {
      expect(STORAGE_MEASUREMENT_TTL_MS).toBe(10 * 60_000);
      const at = (ms: number) => new Date(NOW.getTime() - ms);
      expect(isMeasurementStale(at(10 * 60_000 - 1), NOW)).toBe(false);
      expect(isMeasurementStale(at(10 * 60_000), NOW)).toBe(true);
    });
    it('is stale when the measurement is in the future (clock moved back)', () => {
      expect(isMeasurementStale(new Date(NOW.getTime() + 1), NOW)).toBe(true);
    });
  });
});
