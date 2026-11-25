import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { PublicAvailability } from '../../domain/availability';
import {
  pickLocation,
  pickService,
  publicDates,
  publicDay,
  publishedServices,
} from '../../domain/public-view.rules';
import { BUSINESS_CLOCK, BusinessClock } from '../ports/business-clock.port';
import { CATALOG_LOOKUP, CatalogLookup } from '../ports/catalog-lookup.port';
import { GetAvailabilityUseCase } from './get-availability.use-case';

export interface GetPublicAvailabilityCommand {
  /** The first published service when omitted. */
  serviceId?: string;
  /** The default location when omitted. */
  locationId?: string;
}

/**
 * The general view behind `/disponibilidad`: for one service, the times of the
 * next days at which AT LEAST ONE professional is free. The hours themselves
 * come from `GetAvailabilityUseCase`, the single source the booking modal and
 * the WhatsApp bot use too.
 *
 * `{ enabled: false }` while the page is off. Err(LocationNotFound) for an
 * unknown or inactive location, Err(PublishedServiceNotFound) for a service
 * that is not published.
 */
@Injectable()
export class GetPublicAvailabilityUseCase {
  constructor(
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
    private readonly getAvailability: GetAvailabilityUseCase,
  ) {}

  async execute(
    command: GetPublicAvailabilityCommand,
  ): Promise<Result<PublicAvailability>> {
    const settings = await this.catalog.getPublicSettings();
    if (!settings.enabled) {
      return ok({ enabled: false });
    }

    const activeLocations = await this.catalog.getActiveLocations();
    const location = pickLocation(activeLocations, command.locationId);
    if (!location.ok) return location;

    const published = publishedServices(
      await this.catalog.getActiveServices(),
      settings.serviceIds,
    );
    const chosen = pickService(published, command.serviceId);
    if (!chosen.ok) return chosen;
    const serviceId = chosen.value;
    if (serviceId === null) {
      return ok({
        enabled: true,
        services: [],
        serviceId: null,
        locationId: location.value.id,
        locations: activeLocations,
        days: [],
      });
    }

    const { today, time } = this.clock.now();
    const days = await Promise.all(
      publicDates(today, settings.days).map((date) =>
        this.getAvailability.execute({
          date,
          serviceIds: [serviceId],
          locationId: location.value.id,
        }),
      ),
    );
    const failed = days.find((day) => !day.ok);
    if (failed && !failed.ok) return failed;

    return ok({
      enabled: true,
      services: published,
      serviceId,
      locationId: location.value.id,
      locations: activeLocations,
      days: days.flatMap((day) =>
        day.ok ? [publicDay(day.value, today, time)] : [],
      ),
    });
  }
}
