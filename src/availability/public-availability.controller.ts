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
  ): Promise<PublicAvailability> {
    return this.service.getPublicAvailability(
      typeof serviceId === 'string' && serviceId.trim() !== ''
        ? serviceId.trim()
        : undefined,
    );
  }
}
