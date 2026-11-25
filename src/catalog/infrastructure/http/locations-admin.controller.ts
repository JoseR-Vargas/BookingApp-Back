import { Body, Controller, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { respond } from '../../../shared/infrastructure/http/respond';
import { AdminLocation } from '../../catalog.config';
import { CreateLocationUseCase } from '../../application/use-cases/locations/create-location.use-case';
import { UpdateLocationUseCase } from '../../application/use-cases/locations/update-location.use-case';
import { toAdminLocation } from './catalog.presenter';
import {
  parseCreateLocationInput,
  parseUpdateLocationInput,
} from './location.input';

/** Location endpoints of the admin panel, all behind the admin key. */
@Controller('admin/locations')
@UseGuards(AdminKeyGuard)
export class LocationsAdminController {
  constructor(
    private readonly createLocation: CreateLocationUseCase,
    private readonly updateLocation: UpdateLocationUseCase,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<AdminLocation> {
    return toAdminLocation(
      respond(
        await this.createLocation.execute({
          input: parseCreateLocationInput(body),
        }),
      ),
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminLocation> {
    return toAdminLocation(
      respond(
        await this.updateLocation.execute({
          id,
          patch: parseUpdateLocationInput(body),
        }),
      ),
    );
  }
}
