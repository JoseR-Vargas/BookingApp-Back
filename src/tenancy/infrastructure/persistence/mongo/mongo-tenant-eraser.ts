import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { TenantEraser } from '../../../application/ports/tenant-eraser.port';
import { SCOPED_COLLECTIONS } from '../../migration/tenant-migration';
import { TenantRecord } from './tenant.entity';

/**
 * Deletes a business and its scoped documents with the raw driver, inside the
 * explicit `unscoped` escape: it is the compensation of a failed signup. The
 * connection comes from the model of the business (`model.db`).
 */
@Injectable()
export class MongoTenantEraser implements TenantEraser {
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly tenants: Model<TenantRecord>,
  ) {}

  async erase(tenantId: string): Promise<void> {
    const id = new Types.ObjectId(tenantId);
    await unscoped('the compensation of a failed signup', async () => {
      for (const name of SCOPED_COLLECTIONS) {
        await this.tenants.db.collection(name).deleteMany({ tenantId: id });
      }
      await this.tenants.deleteOne({ _id: id }).exec();
    });
  }
}
