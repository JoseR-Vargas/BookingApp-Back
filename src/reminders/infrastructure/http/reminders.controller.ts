// ===== CONTROLADOR DE LOS RECORDATORIOS =====
// The HTTP edge of the reminders (spec 24): the owner reads the configuration
// of its business and saves it. The business failure of an invalid
// configuration is a `Result` the single filter turns into a 400.

import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetReminderSettingsUseCase } from '../../application/use-cases/get-reminder-settings.use-case';
import { SaveReminderSettingsUseCase } from '../../application/use-cases/save-reminder-settings.use-case';
import {
  ReminderSettingsJson,
  toReminderSettingsJson,
} from './reminder.presenter';

/**
 * The reminders of the business in force. Owner only: the configuration
 * says what the business tells its clients and when.
 */
@Controller('admin/reminders')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class RemindersController {
  constructor(
    private readonly settings: GetReminderSettingsUseCase,
    private readonly save: SaveReminderSettingsUseCase,
  ) {}

  @Get()
  async get(): Promise<ReminderSettingsJson> {
    return toReminderSettingsJson(respond(await this.settings.execute()));
  }

  @Put()
  async put(@Body() body: unknown): Promise<ReminderSettingsJson> {
    respond(await this.save.execute(body));
    return toReminderSettingsJson(respond(await this.settings.execute()));
  }
}
