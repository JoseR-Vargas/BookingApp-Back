import { Controller, Get, Query } from '@nestjs/common';
import {
  PublicAvailability,
  PublicAvailabilityService,
} from './public-availability.service';

/** Public (no key): the page only shows what the admin chose to publish. */
@Controller('public-availability')
export class PublicAvailabilityController {
  constructor(private readonly service: PublicAvailabilityService) {}

  @Get()
  getPublicAvailability(
    @Query('serviceId') serviceId?: string,
    @Query('locationId') locationId?: string,
  ): Promise<PublicAvailability> {
    const clean = (value?: string) =>
      typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : undefined;
    return this.service.getPublicAvailability(
      clean(serviceId),
      undefined,
      clean(locationId),
    );
  }
}
