import { BadRequestException, Injectable } from '@nestjs/common';
import { LocationNotFoundError } from '../catalog/locations';
import { ServiceSelectionError } from '../catalog/service-selection';
import { GetAvailabilityUseCase } from './application/use-cases/get-availability.use-case';
import { LocatedAvailability } from './domain/availability';
import {
  InvalidDate,
  LocationNotFound,
  ServiceSelectionFailed,
} from './domain/availability.errors';

export type {
  Availability,
  LocatedAvailability,
  ProfessionalAvailability,
} from './domain/availability';

/**
 * What the WhatsApp bot still calls.
 *
 * @deprecated TEMPORARY FACADE (spec 13). It holds no business rule: it wraps
 * `GetAvailabilityUseCase` and answers with the exceptions the bot expects
 * (a BadRequestException, a LocationNotFoundError, a ServiceSelectionError).
 * It is deleted when the bot migrates and calls the use case (spec 26).
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly getAvailabilityUseCase: GetAvailabilityUseCase,
  ) {}

  /**
   * Free start times, per professional offering ALL the services, for the
   * back-to-back block of the services. Throws a ServiceSelectionError for an
   * empty, duplicated or unknown service id, a LocationNotFoundError for an
   * unknown or inactive `locationId` and a BadRequestException for an invalid
   * date. Without `locationId` the default location is used.
   */
  async getAvailability(
    date: string,
    serviceIds: string[],
    locationId?: string,
  ): Promise<LocatedAvailability> {
    const result = await this.getAvailabilityUseCase.execute({
      date,
      serviceIds,
      locationId,
    });
    if (result.ok) {
      return result.value;
    }
    const { error } = result;
    if (error instanceof InvalidDate) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof LocationNotFound) {
      throw new LocationNotFoundError(error.locationId);
    }
    if (error instanceof ServiceSelectionFailed) {
      throw new ServiceSelectionError(error.failure, error.serviceId);
    }
    throw error;
  }
}
