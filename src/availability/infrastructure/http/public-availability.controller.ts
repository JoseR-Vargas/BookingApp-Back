import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PublicRateLimitGuard } from '../../../shared/infrastructure/http/public-rate-limit.guard';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetPublicAvailabilityUseCase } from '../../application/use-cases/get-public-availability.use-case';
import { PublicAvailability } from '../../domain/availability';
import { cleanQueryValue } from './availability.input';

/** Public (no key): the page only shows what the admin chose to publish. */
@Controller('public-availability')
@UseGuards(PublicRateLimitGuard)
export class PublicAvailabilityController {
  constructor(
    private readonly getPublicAvailability: GetPublicAvailabilityUseCase,
  ) {}

  @Get()
  async get(
    @Query('serviceId') serviceId?: string,
    @Query('locationId') locationId?: string,
  ): Promise<PublicAvailability> {
    return respond(
      await this.getPublicAvailability.execute({
        serviceId: cleanQueryValue(serviceId),
        locationId: cleanQueryValue(locationId),
      }),
    );
  }
}
