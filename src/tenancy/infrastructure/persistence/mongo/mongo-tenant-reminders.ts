// ===== ADAPTADOR: LOS RECORDATORIOS DEL NEGOCIO =====
// Reads and saves the reminder settings of the business in force (spec 24).
// The `tenants` collection has no `tenantId`: the business is not owned by
// another business, so the read runs inside the explicit `unscoped` escape.

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../../../shared/application/tenant-context.port';
import { defaultReminderSettings } from '../../../../shared/domain/reminders';
import { ReminderSettings } from '../../../../shared/domain/reminders';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import {
  TenantRemindersProfile,
  TenantRemindersReader,
  TenantRemindersWriter,
} from '../../../application/ports/tenant-reminders.port';
import { TenantRecord } from './tenant.entity';
import { toReminderSettings } from './tenant.mapper';

@Injectable()
export class MongoTenantReminders
  implements TenantRemindersReader, TenantRemindersWriter
{
  constructor(
    @InjectModel(TenantRecord.name)
    private readonly model: Model<TenantRecord>,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
  ) {}

  async profile(): Promise<TenantRemindersProfile> {
    const tenant = this.context.current();
    const record = await unscoped('the reminders of a business', () =>
      this.model
        .findById(new Types.ObjectId(tenant.id))
        .lean<TenantRecord | null>()
        .exec(),
    );
    return {
      name: record?.name ?? tenant.slug,
      settings: record ? toReminderSettings(record) : defaultReminderSettings(),
    };
  }

  async save(settings: ReminderSettings): Promise<ReminderSettings> {
    const tenant = this.context.current();
    await unscoped('the reminders of a business', () =>
      this.model
        .updateOne(
          { _id: new Types.ObjectId(tenant.id) },
          { $set: { reminders: settings } },
        )
        .exec(),
    );
    return settings;
  }
}
