import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { currentBusinessDate } from '../../../admin/schedule-impact';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { respond } from '../../../shared/infrastructure/http/respond';
import { CreateServiceUseCase } from '../../application/use-cases/services/create-service.use-case';
import { DeactivateServiceUseCase } from '../../application/use-cases/services/deactivate-service.use-case';
import { DeleteServicePermanentlyUseCase } from '../../application/use-cases/services/delete-service-permanently.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/services/update-service.use-case';
import { AdminService, toAdminService } from './catalog.presenter';
import {
  parseCreateServiceInput,
  parseUpdateServiceInput,
} from './service.input';

/** Service endpoints of the admin panel, all behind the admin key. */
@Controller('admin/services')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class ServicesAdminController {
  constructor(
    private readonly createService: CreateServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deactivateService: DeactivateServiceUseCase,
    private readonly deleteService: DeleteServicePermanentlyUseCase,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<AdminService> {
    return toAdminService(
      respond(await this.createService.execute(parseCreateServiceInput(body))),
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminService> {
    return toAdminService(
      respond(
        await this.updateService.execute({
          id,
          patch: parseUpdateServiceInput(body),
        }),
      ),
    );
  }

  /** Soft delete: the service stays in the database, inactive. */
  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<AdminService> {
    return toAdminService(respond(await this.deactivateService.execute(id)));
  }

  /** Hard delete. Refused with 409 while the service has future confirmed bookings. */
  @Delete(':id/permanent')
  async deletePermanently(
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: true }> {
    return respond(
      await this.deleteService.execute({ id, today: currentBusinessDate() }),
    );
  }
}
