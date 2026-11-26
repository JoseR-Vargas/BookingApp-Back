// ===== ADAPTADOR: EL DIRECTORIO DE NEGOCIOS =====
// Every business of the installation (spec 24): the scheduler of the
// reminders walks them one by one. Like the rest of the reads of the
// `tenants` collection, it runs inside the explicit `unscoped` escape.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { TenantDirectory } from '../../../application/ports/tenant-directory.port';
import { Tenant } from '../../../domain/tenant';
import { TenantRecord } from './tenant.entity';
import { toTenant } from './tenant.mapper';

@Injectable()
export class MongoTenantDirectory implements TenantDirectory {
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly model: Model<TenantRecord>,
  ) {}

  async list(): Promise<Tenant[]> {
    const records = await unscoped('the directory of the businesses', () =>
      this.model.find().lean<TenantRecord[]>().exec(),
    );
    return records.map(toTenant);
  }
}
