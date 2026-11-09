import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ServiceSelectionError } from '../catalog/service-selection';
import { dayOfWeekFromIsoDate } from './availability.calculator';
import { Availability, AvailabilityService } from './availability.service';

/** Splits `a,b,c` into trimmed ids; anything else is a client error. */
function parseServiceIds(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('serviceIds is required');
  }
  const ids = value.split(',').map((id) => id.trim());
  if (ids.some((id) => id === '')) {
    throw new BadRequestException(
      'serviceIds must be a comma-separated list of service ids',
    );
  }
  return ids;
}

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getAvailability(
    @Query('date') date: string,
    @Query('serviceIds') serviceIds: string,
  ): Promise<Availability> {
    if (typeof date !== 'string' || dayOfWeekFromIsoDate(date) === null) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }
    const ids = parseServiceIds(serviceIds);
    try {
      return await this.availabilityService.getAvailability(date, ids);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Unknown service -> 404, other invalid selections -> 400. */
  private toHttpException(error: unknown): unknown {
    if (!(error instanceof ServiceSelectionError)) {
      return error;
    }
    return error.failure === 'unknown'
      ? new NotFoundException(`Service "${error.serviceId}" not found`)
      : new BadRequestException(error.message);
  }
}
