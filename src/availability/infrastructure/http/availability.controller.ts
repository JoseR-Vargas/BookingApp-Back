import { Controller, Get, Query } from '@nestjs/common';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { LocatedAvailability } from '../../domain/availability';
import { parseAvailabilityQuery } from './availability.input';

/** Bookable start times of a day (public: the booking modal reads it). */
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly getAvailability: GetAvailabilityUseCase) {}

  @Get()
  async get(
    @Query('date') date: string,
    @Query('serviceIds') serviceIds: string,
    @Query('locationId') locationId?: string,
  ): Promise<LocatedAvailability> {
    const query = respond(parseAvailabilityQuery(date, serviceIds, locationId));
    return respond(await this.getAvailability.execute(query));
  }
}
