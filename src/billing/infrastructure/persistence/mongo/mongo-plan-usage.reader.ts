import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../../../shared/application/tenant-context.port';
import { PlanUsageReader } from '../../../application/ports/plan-usage.reader';

/**
 * Counts what the business in force has created. It reads the collections of
 * other modules with the raw driver (as `MongoTenantBookingCounter` does), so
 * it names the business itself: the plugin does not run on the raw driver.
 */
@Injectable()
export class MongoPlanUsageReader implements PlanUsageReader {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
  ) {}

  countProfessionals(): Promise<number> {
    return this.count('professionals', { active: true });
  }

  countLocations(): Promise<number> {
    return this.count('locations', { active: true });
  }

  countBookings(range: { start: Date; end: Date }): Promise<number> {
    return this.count('bookings', {
      createdAt: { $gte: range.start, $lt: range.end },
    });
  }

  private count(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<number> {
    return this.connection.collection(collection).countDocuments({
      ...filter,
      tenantId: new Types.ObjectId(this.context.current().id),
    });
  }
}
