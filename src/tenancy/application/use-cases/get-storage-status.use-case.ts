// ===== CASO DE USO: ESTADO DEL ALMACENAMIENTO =====
// How full the storage of the business in force is. The size is measured on
// demand and kept for 10 minutes (in the record of the business and in the
// memory of the process), so the database spends few operations (spec 22).

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../../shared/application/tenant-context.port';
import { Result, err, ok } from '../../../shared/domain/result';
import {
  isMeasurementStale,
  StorageStatus,
  storageStatusOf,
} from '../../domain/storage.rules';
import {
  TENANT_STORAGE_METER,
  TenantStorageMeter,
} from '../ports/tenant-storage-meter.port';
import {
  TENANT_STORAGE_STORE,
  TenantStorageStore,
} from '../ports/tenant-storage-store.port';
import { TenantService } from '../tenant.service';

interface Measurement {
  usedBytes: number;
  measuredAt: Date | null;
}

@Injectable()
export class GetStorageStatusUseCase {
  /**
   * The newest measurement made by this process. `TenantService` keeps the
   * business record for a minute, so its copy of the measurement can be older.
   */
  private readonly latest = new Map<string, Measurement>();
  private readonly measuring = new Map<string, Promise<Measurement>>();

  constructor(
    private readonly tenants: TenantService,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
    @Inject(TENANT_STORAGE_METER) private readonly meter: TenantStorageMeter,
    @Inject(TENANT_STORAGE_STORE) private readonly store: TenantStorageStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `null` for a business without a cap. */
  async execute(): Promise<Result<StorageStatus | null>> {
    const resolved = await this.tenants.resolve(this.context.current().slug);
    if (!resolved.ok) return err(resolved.error);
    const tenant = resolved.value;
    if (tenant.storageQuotaBytes === null) return ok(null);

    const known = this.newest(tenant.id, {
      usedBytes: tenant.storageUsedBytes,
      measuredAt: tenant.storageMeasuredAt,
    });
    const current = isMeasurementStale(known.measuredAt, this.clock.now())
      ? await this.measure(tenant.id, known)
      : known;
    return ok(
      storageStatusOf({
        storageQuotaBytes: tenant.storageQuotaBytes,
        storageUsedBytes: current.usedBytes,
      }),
    );
  }

  private newest(id: string, fromRecord: Measurement): Measurement {
    const mine = this.latest.get(id);
    if (!mine?.measuredAt) return fromRecord;
    const recordAt = fromRecord.measuredAt?.getTime() ?? -Infinity;
    return mine.measuredAt.getTime() >= recordAt ? mine : fromRecord;
  }

  /** One measurement at a time per business; a failure keeps the last known size. */
  private measure(id: string, fallback: Measurement): Promise<Measurement> {
    const running = this.measuring.get(id);
    if (running) return running;
    const started = this.measureAndStore(id, fallback).finally(() =>
      this.measuring.delete(id),
    );
    this.measuring.set(id, started);
    return started;
  }

  private async measureAndStore(
    id: string,
    fallback: Measurement,
  ): Promise<Measurement> {
    try {
      const measuredAt = this.clock.now();
      const usedBytes = await this.meter.measure(id);
      const fresh = { usedBytes, measuredAt };
      this.latest.set(id, fresh);
      await this.store.saveMeasurement(id, usedBytes, measuredAt);
      return fresh;
    } catch {
      // The size is informative: a failing database must not break the panel
      // nor lose a booking. The next request tries again.
      return this.latest.get(id) ?? fallback;
    }
  }
}
