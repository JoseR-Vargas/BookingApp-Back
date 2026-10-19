import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { dayOfWeekFromIsoDate } from './availability.calculator';
import { Availability, AvailabilityService } from './availability.service';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getAvailability(
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
  ): Promise<Availability> {
    if (typeof date !== 'string' || dayOfWeekFromIsoDate(date) === null) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }
    if (typeof serviceId !== 'string' || serviceId.trim() === '') {
      throw new BadRequestException('serviceId is required');
    }
    const availability = await this.availabilityService.getAvailability(
      date,
      serviceId,
    );
    if (!availability) {
      throw new NotFoundException(`Service "${serviceId}" not found`);
    }
    return availability;
  }
}
