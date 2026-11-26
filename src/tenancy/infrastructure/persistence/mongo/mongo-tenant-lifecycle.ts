// ===== ADAPTADOR: CICLO DE VIDA DEL NEGOCIO =====
// The manual changes of the owner of the system on a business (spec 25): the
// state and the deadline of its trial. The collection `tenants` has no
// `tenantId` (a business is not owned by another business), but the read
// still runs inside the explicit `unscoped` escape, like every other read of
// this collection.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { TenantLifecycleWriter } from '../../../application/ports/tenant-lifecycle.port';
import { Tenant, TenantStatus } from '../../../domain/tenant';
import { TenantRecord } from './tenant.entity';
import { toTenant } from './tenant.mapper';

@Injectable()
export class MongoTenantLifecycle implements TenantLifecycleWriter {
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly model: Model<TenantRecord>,
  ) {}

  async setStatus(id: string, status: TenantStatus): Promise<Tenant> {
    return this.update(id, { status });
  }

  async setTrialEndsAt(id: string, trialEndsAt: Date): Promise<Tenant> {
    return this.update(id, { trialEndsAt });
  }

  private async update(
    id: string,
    fields: Partial<TenantRecord>,
  ): Promise<Tenant> {
    const record = await unscoped(
      'the manual action of the owner of the system on a business',
      () =>
        this.model
          .findByIdAndUpdate(
            new Types.ObjectId(id),
            { $set: fields },
            { new: true },
          )
          .lean<TenantRecord | null>()
          .exec(),
    );
    if (!record) {
      throw new Error(
        `The business "${id}" does not exist anymore: it cannot be changed.`,
      );
    }
    return toTenant(record);
  }
}
