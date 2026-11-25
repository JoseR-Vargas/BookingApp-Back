import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import {
  ScheduleImpactService,
  currentBusinessDate,
} from '../../../admin/schedule-impact';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import { respond } from '../../../shared/infrastructure/http/respond';
import { ResolveDefaultLocationUseCase } from '../../application/use-cases/locations/resolve-default-location.use-case';
import { SaveLocationScheduleUseCase } from '../../application/use-cases/locations/save-location-schedule.use-case';
import { scheduleOf } from '../../domain/location.rules';
import { parseScheduleInput } from './location.input';

interface ScheduleSaved {
  schedule: WeeklySchedule;
  affectedBookings: number;
}

/**
 * Schedule endpoints of the admin panel, all behind the admin key. Upcoming
 * bookings a schedule leaves out of hours never block the save; they are only
 * counted so the UI can warn the admin.
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class ScheduleAdminController {
  constructor(
    private readonly saveLocationSchedule: SaveLocationScheduleUseCase,
    private readonly resolveDefaultLocation: ResolveDefaultLocationUseCase,
    private readonly scheduleImpact: ScheduleImpactService,
  ) {}

  /** The schedule of the DEFAULT location (the contract predates locations). */
  @Put('schedule')
  async saveSchedule(@Body() body: unknown): Promise<ScheduleSaved> {
    const { weekly, startIntervalMinutes } = parseScheduleInput(body);
    const schedule = scheduleOf(
      respond(
        await this.saveLocationSchedule.execute({
          weekly,
          startIntervalMinutes,
        }),
      ),
    );
    const defaultLocationId = await this.defaultLocationId();
    const affectedBookings = await this.scheduleImpact.countAffected(
      schedule,
      currentBusinessDate(),
      { locationId: defaultLocationId, defaultLocationId },
    );
    return { schedule, affectedBookings };
  }

  /** The schedule of one location; only that location's bookings are counted. */
  @Put('locations/:id/schedule')
  async saveLocationScheduleOf(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ScheduleSaved> {
    const { weekly, startIntervalMinutes } = parseScheduleInput(body);
    const schedule = scheduleOf(
      respond(
        await this.saveLocationSchedule.execute({
          locationId: id,
          weekly,
          startIntervalMinutes,
        }),
      ),
    );
    const affectedBookings = await this.scheduleImpact.countAffected(
      schedule,
      currentBusinessDate(),
      { locationId: id, defaultLocationId: await this.defaultLocationId() },
    );
    return { schedule, affectedBookings };
  }

  private async defaultLocationId(): Promise<string> {
    return respond(await this.resolveDefaultLocation.execute()).id;
  }
}
