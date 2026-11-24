import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { CatalogAdminService } from '../catalog/catalog-admin.service';
import {
  parseLocationCreate,
  parseLocationUpdate,
  parsePublicAvailability,
  parseStartInterval,
  parseWeeklySchedule,
} from '../catalog/catalog-validation';
import {
  AdminLocation,
  PublicAvailabilitySettings,
  WeeklySchedule,
} from '../catalog/catalog.config';
import { AdminCatalog, CatalogService } from '../catalog/catalog.service';
import { ScheduleImpactService, currentBusinessDate } from './schedule-impact';

/**
 * Business configuration endpoints, all behind the admin key: the catalog
 * read, schedules, locations and the public availability settings. The
 * professional and service routes live in the catalog module.
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly catalogAdmin: CatalogAdminService,
    private readonly scheduleImpact: ScheduleImpactService,
  ) {}

  @Get('catalog')
  getCatalog(): Promise<AdminCatalog> {
    return this.catalog.getAdminCatalog();
  }

  /**
   * Saves the weekly schedule. Upcoming bookings it leaves out of hours never
   * block the save; they are only counted so the UI can warn the admin.
   */
  @Put('schedule')
  async saveSchedule(
    @Body() body: unknown,
  ): Promise<{ schedule: WeeklySchedule; affectedBookings: number }> {
    const schedule = await this.catalogAdmin.saveSchedule(
      parseWeeklySchedule(body),
      parseStartInterval(body),
    );
    const defaultLocationId = await this.catalog.getDefaultLocationId();
    const affectedBookings = await this.scheduleImpact.countAffected(
      schedule,
      currentBusinessDate(),
      { locationId: defaultLocationId, defaultLocationId },
    );
    return { schedule, affectedBookings };
  }

  @Post('locations')
  createLocation(@Body() body: unknown): Promise<AdminLocation> {
    return this.catalogAdmin.createLocation(parseLocationCreate(body));
  }

  @Put('locations/:id')
  updateLocation(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminLocation> {
    return this.catalogAdmin.updateLocation(id, parseLocationUpdate(body));
  }

  /**
   * Saves the weekly schedule of one location. Like `PUT schedule`, bookings
   * it leaves out of hours never block the save; only that location's
   * bookings are counted.
   */
  @Put('locations/:id/schedule')
  async saveLocationSchedule(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ schedule: WeeklySchedule; affectedBookings: number }> {
    const weekly = parseWeeklySchedule(body);
    const startIntervalMinutes = parseStartInterval(body);
    const schedule = await this.catalogAdmin.saveLocationSchedule(
      id,
      weekly,
      startIntervalMinutes,
    );
    const affectedBookings = await this.scheduleImpact.countAffected(
      schedule,
      currentBusinessDate(),
      {
        locationId: id,
        defaultLocationId: await this.catalog.getDefaultLocationId(),
      },
    );
    return { schedule, affectedBookings };
  }

  /** Settings of the public availability page (`/disponibilidad`). */
  @Put('public-availability')
  async savePublicAvailability(
    @Body() body: unknown,
  ): Promise<{ publicAvailability: PublicAvailabilitySettings }> {
    const publicAvailability = await this.catalogAdmin.savePublicAvailability(
      parsePublicAvailability(body),
    );
    return { publicAvailability };
  }
}
