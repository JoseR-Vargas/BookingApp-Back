import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { respond } from '../../../shared/infrastructure/http/respond';
import { PublicAvailabilitySettings } from '../../domain/public-availability';
import { SavePublicAvailabilityUseCase } from '../../application/use-cases/settings/save-public-availability.use-case';
import { parsePublicAvailabilityInput } from './location.input';

/** Settings of the public availability page (`/disponibilidad`), behind the admin key. */
@Controller('admin/public-availability')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class PublicAvailabilityAdminController {
  constructor(
    private readonly savePublicAvailability: SavePublicAvailabilityUseCase,
  ) {}

  @Put()
  async save(
    @Body() body: unknown,
  ): Promise<{ publicAvailability: PublicAvailabilitySettings }> {
    const publicAvailability = respond(
      await this.savePublicAvailability.execute({
        settings: parsePublicAvailabilityInput(body),
      }),
    );
    return { publicAvailability };
  }
}
