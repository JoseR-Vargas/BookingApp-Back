import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { TenantRecord } from './tenant.entity';
import { TenantBookingCounter } from '../../../application/ports/tenant-booking-counter.port';

/** Counts the `bookings` of a business (cancelled ones included). */
@Injectable()
export class MongoTenantBookingCounter implements TenantBookingCounter {
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly tenants: Model<TenantRecord>,
  ) {}

  count(tenantId: string): Promise<number> {
    return unscoped('the trial count of the business', () =>
      this.tenants.db
        .collection('bookings')
        .countDocuments({ tenantId: new Types.ObjectId(tenantId) }),
    );
  }
}
