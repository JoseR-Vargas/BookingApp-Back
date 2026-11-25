import { Injectable } from '@nestjs/common';
import { CatalogService } from '../../../catalog/catalog.service';
import { toWeeklySchedule } from '../../../catalog/domain/location.rules';
import { LocationNotFoundError } from '../../../catalog/locations';
import { ServiceSelectionError } from '../../../catalog/service-selection';
import { Result, err, ok } from '../../../shared/domain/result';
import { CatalogLookup } from '../../application/ports/catalog-lookup.port';
import {
  AvailabilityLocation,
  LocationSummary,
  OfferedService,
  PublicSettings,
  ServiceSelection,
} from '../../domain/availability';
import {
  LocationNotFound,
  ServiceSelectionFailed,
} from '../../domain/availability.errors';

/**
 * Answers the catalog questions of availability through the temporary
 * `CatalogService` facade, turning the exceptions it raises for business
 * failures (an unknown location, a bad selection) into `Err` values.
 *
 * PROVISIONAL (spec 13): replaced by the catalog use cases when the facade is
 * deleted (specs 17 and 26).
 */
@Injectable()
export class CatalogFacadeLookup implements CatalogLookup {
  constructor(private readonly catalog: CatalogService) {}

  async getLocation(
    locationId: string | undefined,
  ): Promise<Result<AvailabilityLocation>> {
    try {
      const location = await this.catalog.getLocation(locationId);
      return ok({
        id: location.id,
        name: location.name,
        schedule: toWeeklySchedule(location),
      });
    } catch (error) {
      if (error instanceof LocationNotFoundError) {
        return err(new LocationNotFound(error.locationId));
      }
      throw error;
    }
  }

  async resolveServices(
    serviceIds: string[],
    locationId: string,
  ): Promise<Result<ServiceSelection>> {
    try {
      const selection = await this.catalog.resolveServices(
        serviceIds,
        locationId,
      );
      return ok({
        services: selection.services.map(({ id, name, duration }) => ({
          id,
          name,
          duration,
        })),
        professionals: selection.professionals.map(({ id, name }) => ({
          id,
          name,
        })),
        totalDuration: selection.totalDuration,
      });
    } catch (error) {
      if (error instanceof ServiceSelectionError) {
        return err(new ServiceSelectionFailed(error.failure, error.serviceId));
      }
      if (error instanceof LocationNotFoundError) {
        return err(new LocationNotFound(error.locationId));
      }
      throw error;
    }
  }

  async getActiveLocations(): Promise<LocationSummary[]> {
    const locations = await this.catalog.getActiveLocations();
    return locations.map(({ id, name }) => ({ id, name }));
  }

  async getPublicSettings(): Promise<PublicSettings> {
    const { enabled, days, serviceIds } =
      await this.catalog.getPublicAvailability();
    return { enabled, days, serviceIds };
  }

  async getActiveServices(): Promise<OfferedService[]> {
    const { services } = await this.catalog.getCatalog();
    return services.map(({ id, name, duration }) => ({ id, name, duration }));
  }
}
