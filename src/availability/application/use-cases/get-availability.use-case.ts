import { Inject, Injectable, Optional } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { LocatedAvailability } from '../../domain/availability';
import {
  checkDate,
  dayAvailability,
  isClosedDay,
} from '../../domain/day-availability.rules';
import {
  AVAILABILITY_CACHE,
  AvailabilityCache,
} from '../ports/availability-cache.port';
import { CATALOG_LOOKUP, CatalogLookup } from '../ports/catalog-lookup.port';
import {
  OCCUPIED_SLOTS_READER,
  OccupiedSlotsReader,
} from '../ports/occupied-slots.reader';

export interface GetAvailabilityCommand {
  date: string;
  serviceIds: string[];
  /** The default location (the oldest active) when omitted. */
  locationId?: string;
}

/**
 * Free start times of a day, per professional offering ALL the services, for
 * the back-to-back block of the services, at one location.
 *
 * Err(InvalidDate), Err(LocationNotFound) for an unknown or inactive location,
 * Err(ServiceSelectionFailed) for an empty, repeated or unknown service id. A
 * closed day never asks for bookings.
 *
 * A good answer is kept for a short time per business, date, services and
 * location (spec 22); whatever changes the answer invalidates the cache. Errors
 * are never cached. The cache is optional so the use case works without one.
 */
@Injectable()
export class GetAvailabilityUseCase {
  constructor(
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(OCCUPIED_SLOTS_READER)
    private readonly occupiedSlots: OccupiedSlotsReader,
    @Optional()
    @Inject(AVAILABILITY_CACHE)
    private readonly cache?: AvailabilityCache,
  ) {}

  async execute(
    command: GetAvailabilityCommand,
  ): Promise<Result<LocatedAvailability>> {
    if (!this.cache) return this.compute(command);
    const hit = this.cache.get(command);
    if (hit) return ok(hit);
    const stamp = this.cache.stamp();
    const computed = await this.compute(command);
    if (computed.ok) this.cache.set(command, computed.value, stamp);
    return computed;
  }

  private async compute(
    command: GetAvailabilityCommand,
  ): Promise<Result<LocatedAvailability>> {
    const day = checkDate(command.date);
    if (!day.ok) return day;
    const location = await this.catalog.getLocation(command.locationId);
    if (!location.ok) return location;
    const selection = await this.catalog.resolveServices(
      command.serviceIds,
      location.value.id,
    );
    if (!selection.ok) return selection;

    const occupied = isClosedDay(day.value, location.value.schedule)
      ? []
      : await this.occupiedSlots.findOccupied(
          command.date,
          selection.value.professionals.map(({ id }) => id),
        );
    return ok(
      dayAvailability({
        date: command.date,
        dayOfWeek: day.value,
        location: location.value,
        selection: selection.value,
        occupied,
      }),
    );
  }
}
