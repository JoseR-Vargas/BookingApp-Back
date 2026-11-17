import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { CatalogAdminService } from '../catalog/catalog-admin.service';
import {
  parseOptionalPhotoDataUrl,
  parseProfessionalCreate,
  parseProfessionalPhotoBody,
  parseProfessionalUpdate,
  parseServiceCreate,
  parseServiceUpdate,
  parseWeeklySchedule,
} from '../catalog/catalog-validation';
import { WeeklySchedule } from '../catalog/catalog.config';
import {
  AdminCatalog,
  AdminProfessional,
  AdminService,
  CatalogService,
} from '../catalog/catalog.service';
import { ScheduleImpactService, currentBusinessDate } from './schedule-impact';

/** Business configuration endpoints, all behind the admin key. */
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

  @Post('professionals')
  async createProfessional(@Body() body: unknown): Promise<AdminProfessional> {
    const input = parseProfessionalCreate(body);
    const photo = parseOptionalPhotoDataUrl(body);
    return this.catalogAdmin.createProfessional(input, photo);
  }

  @Patch('professionals/:id')
  async updateProfessional(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminProfessional> {
    return this.catalogAdmin.updateProfessional(
      id,
      parseProfessionalUpdate(body),
    );
  }

  @Put('professionals/:id/photo')
  setProfessionalPhoto(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminProfessional> {
    return this.catalogAdmin.setProfessionalPhoto(
      id,
      parseProfessionalPhotoBody(body),
    );
  }

  @Delete('professionals/:id/photo')
  removeProfessionalPhoto(@Param('id') id: string): Promise<AdminProfessional> {
    return this.catalogAdmin.removeProfessionalPhoto(id);
  }

  /** Soft delete: the professional stays in the database, inactive. */
  @Delete('professionals/:id')
  deleteProfessional(@Param('id') id: string): Promise<AdminProfessional> {
    return this.catalogAdmin.updateProfessional(id, { active: false });
  }

  /**
   * Hard delete. Refused with 409 while the professional has future confirmed
   * bookings or is the only professional of a service.
   */
  @Delete('professionals/:id/permanent')
  deleteProfessionalPermanently(
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: true }> {
    return this.catalogAdmin.deleteProfessionalPermanently(
      id,
      currentBusinessDate(),
    );
  }

  @Post('services')
  async createService(@Body() body: unknown): Promise<AdminService> {
    return this.catalogAdmin.createService(parseServiceCreate(body));
  }

  @Patch('services/:id')
  async updateService(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminService> {
    return this.catalogAdmin.updateService(id, parseServiceUpdate(body));
  }

  /** Soft delete: the service stays in the database, inactive. */
  @Delete('services/:id')
  deleteService(@Param('id') id: string): Promise<AdminService> {
    return this.catalogAdmin.updateService(id, { active: false });
  }

  /** Hard delete. Refused with 409 while the service has future confirmed bookings. */
  @Delete('services/:id/permanent')
  deleteServicePermanently(
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: true }> {
    return this.catalogAdmin.deleteServicePermanently(
      id,
      currentBusinessDate(),
    );
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
    );
    const affectedBookings = await this.scheduleImpact.countAffected(
      schedule,
      currentBusinessDate(),
    );
    return { schedule, affectedBookings };
  }
}
