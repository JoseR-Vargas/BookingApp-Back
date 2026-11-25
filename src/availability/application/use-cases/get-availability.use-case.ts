import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { LocatedAvailability } from '../../domain/availability';
import {
  checkDate,
  dayAvailability,
  isClosedDay,
} from '../../domain/day-availability.rules';
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
 */
@Injectable()
export class GetAvailabilityUseCase {
  constructor(
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(OCCUPIED_SLOTS_READER)
    private readonly occupiedSlots: OccupiedSlotsReader,
  ) {}

  async execute(
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
