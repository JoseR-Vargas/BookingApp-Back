import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { TenantStorageMeter } from '../../../application/ports/tenant-storage-meter.port';
import { SCOPED_COLLECTIONS } from '../../migration/tenant-migration';
import { TenantRecord } from './tenant.entity';

/**
 * Sums the BSON size (`$bsonSize`) of the documents of a business in every
 * scoped collection: one aggregation per collection, matched by `tenantId`
 * explicitly (the raw driver bypasses the tenant plugin, inside the
 * `unscoped` escape). Index sizes are not counted: Mongo reports them per
 * collection, not per business.
 */
@Injectable()
export class MongoTenantStorageMeter implements TenantStorageMeter {
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly tenants: Model<TenantRecord>,
  ) {}

  measure(tenantId: string): Promise<number> {
    const id = new Types.ObjectId(tenantId);
    return unscoped('the storage measurement of a business', async () => {
      const sizes = await Promise.all(
        SCOPED_COLLECTIONS.map(async (name) => {
          const [row] = await this.tenants.db
            .collection(name)
            .aggregate<{ bytes: number }>([
              { $match: { tenantId: id } },
              {
                $group: { _id: null, bytes: { $sum: { $bsonSize: '$$ROOT' } } },
              },
            ])
            .toArray();
          return row?.bytes ?? 0;
        }),
      );
      return sizes.reduce((sum, bytes) => sum + bytes, 0);
    });
  }
}
