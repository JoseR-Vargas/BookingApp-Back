// ===== CASO DE USO: GUARDAR LOS RECORDATORIOS DEL NEGOCIO =====
// The owner saves the configuration of the reminders (spec 24). The rules
// decide what is accepted; the tenancy keeps it.

import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REMINDERS_READER,
  TenantRemindersReader,
} from '../../../tenancy/application/ports/tenant-reminders.port';
import {
  TENANT_REMINDERS_WRITER,
  TenantRemindersWriter,
} from '../../../tenancy/application/ports/tenant-reminders.port';
import { ReminderSettings } from '../../../shared/domain/reminders';
import { Result, ok } from '../../../shared/domain/result';
import { mergeReminderSettings } from '../../domain/reminder-settings';

@Injectable()
export class SaveReminderSettingsUseCase {
  constructor(
    @Inject(TENANT_REMINDERS_READER)
    private readonly reader: TenantRemindersReader,
    @Inject(TENANT_REMINDERS_WRITER)
    private readonly writer: TenantRemindersWriter,
  ) {}

  /** The configuration the owner sent on top of the current one. */
  async execute(input: unknown): Promise<Result<ReminderSettings>> {
    const current = await this.reader.profile();
    const merged = mergeReminderSettings(current.settings, input);
    if (!merged.ok) return merged;
    const saved = await this.writer.save(merged.value);
    return ok(saved);
  }
}
