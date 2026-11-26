import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { NewTenant, Tenant } from '../../../domain/tenant';
import {
  TenantReader,
  TenantWriter,
} from '../../../application/ports/tenant.repository';
import { TenantStorageStore } from '../../../application/ports/tenant-storage-store.port';
import { TenantRecord } from './tenant.entity';
import { toNewTenantRecord, toTenant } from './tenant.mapper';

/**
 * Reads and writes the `tenants` collection.
 *
 * The collection has no `tenantId`: a business is not owned by another
 * business. The read runs inside the explicit `unscoped` escape, which is one
 * of the three uses the spec 18 allows.
 */
@Injectable()
export class MongoTenantRepository
  implements TenantReader, TenantWriter, TenantStorageStore
{
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly model: Model<TenantRecord>,
  ) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const record = await unscoped('tenant resolution', () =>
      this.model.findOne({ slug }).lean<TenantRecord | null>().exec(),
    );
    return record ? toTenant(record) : null;
  }

  async findDefault(): Promise<Tenant | null> {
    const record = await unscoped('tenant resolution', () =>
      this.model
        .findOne({ isDefault: true })
        .lean<TenantRecord | null>()
        .exec(),
    );
    return record ? toTenant(record) : null;
  }

  async insert(tenant: NewTenant): Promise<Tenant> {
    const saved = await unscoped('tenant resolution', () =>
      this.model.create(toNewTenantRecord(tenant)),
    );
    return toTenant(saved.toObject() as TenantRecord);
  }

  async saveMeasurement(
    tenantId: string,
    usedBytes: number,
    measuredAt: Date,
  ): Promise<void> {
    await unscoped('the storage measurement of a business', () =>
      this.model
        .updateOne(
          { _id: new Types.ObjectId(tenantId) },
          {
            $set: {
              storageUsedBytes: usedBytes,
              storageMeasuredAt: measuredAt,
            },
          },
        )
        .exec(),
    );
  }
}
