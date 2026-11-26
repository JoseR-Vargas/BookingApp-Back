import { Clock } from '../../../shared/application/clock.port';
import { Tenant } from '../../domain/tenant';
import { TenantReader, TenantWriter } from '../ports/tenant.repository';
import { TenantStorageMeter } from '../ports/tenant-storage-meter.port';
import { TenantStorageStore } from '../ports/tenant-storage-store.port';
import { TenantService } from '../tenant.service';
import { GetStorageStatusUseCase } from './get-storage-status.use-case';

const MB = 1024 * 1024;

describe('GetStorageStatusUseCase', () => {
  let now: number;
  const clock: Clock = { now: () => new Date(now) };
  let row: Tenant;
  let measures: string[];
  let stored: { id: string; used: number; at: Date }[];
  let size: number;
  let meterFails: boolean;

  const build = () => {
    const tenants: TenantReader & TenantWriter = {
      findBySlug: () => Promise.resolve(row),
      findDefault: () => Promise.resolve(null),
      insert: () => Promise.reject(new Error('not used')),
    };
    const meter: TenantStorageMeter = {
      measure: (id) => {
        measures.push(id);
        return meterFails
          ? Promise.reject(new Error('db down'))
          : Promise.resolve(size);
      },
    };
    const store: TenantStorageStore = {
      saveMeasurement: (id, used, at) => {
        stored.push({ id, used, at });
        return Promise.resolve();
      },
    };
    return new GetStorageStatusUseCase(
      new TenantService(tenants, tenants, clock),
      { current: () => ({ id: row.id, slug: row.slug }) },
      meter,
      store,
      clock,
    );
  };

  beforeEach(() => {
    now = Date.parse('2026-11-26T10:00:00Z');
    measures = [];
    stored = [];
    size = 36 * MB;
    meterFails = false;
    row = {
      id: 'abc',
      slug: 'sur',
      name: 'Sur',
      status: 'active',
      isDefault: false,
      createdAt: new Date(now),
      trialEndsAt: null,
      bookingQuota: null,
      storageQuotaBytes: 50 * MB,
      storageUsedBytes: 0,
      storageMeasuredAt: null,
    };
  });

  it('answers null and measures nothing for a business without a cap', async () => {
    row.storageQuotaBytes = null;
    expect(await build().execute()).toEqual({ ok: true, value: null });
    expect(measures).toEqual([]);
  });

  it('measures a business never measured and keeps the result', async () => {
    expect(await build().execute()).toEqual({
      ok: true,
      value: {
        usedBytes: 36 * MB,
        quotaBytes: 50 * MB,
        percent: 72,
        level: 'warning',
      },
    });
    expect(measures).toEqual(['abc']);
    expect(stored).toEqual([{ id: 'abc', used: 36 * MB, at: new Date(now) }]);
  });

  it('reuses the stored measurement for 10 minutes, then measures again', async () => {
    row.storageUsedBytes = 10 * MB;
    row.storageMeasuredAt = new Date(now - 9 * 60_000);
    const useCase = build();

    expect(await useCase.execute()).toMatchObject({
      value: { usedBytes: 10 * MB, level: 'ok' },
    });
    expect(measures).toEqual([]);

    now += 2 * 60_000;
    expect(await useCase.execute()).toMatchObject({
      value: { usedBytes: 36 * MB },
    });
    expect(measures).toEqual(['abc']);
  });

  it('does not measure twice in a row even when the business record is cached stale', async () => {
    const useCase = build();
    await useCase.execute();
    await useCase.execute(); // `row` still says "never measured"
    expect(measures).toEqual(['abc']);
  });

  it('shares one measurement between simultaneous requests', async () => {
    const useCase = build();
    await Promise.all([useCase.execute(), useCase.execute()]);
    expect(measures).toHaveLength(1);
  });

  it('falls back to the last measurement when the meter fails', async () => {
    row.storageUsedBytes = 40 * MB;
    row.storageMeasuredAt = new Date(now - 20 * 60_000);
    meterFails = true;

    expect(await build().execute()).toMatchObject({
      ok: true,
      value: { usedBytes: 40 * MB, level: 'warning' },
    });
    expect(stored).toEqual([]);
  });

  it('is blocked from 100%', async () => {
    size = 50 * MB;
    expect(await build().execute()).toMatchObject({
      value: { percent: 100, level: 'blocked' },
    });
  });
});
