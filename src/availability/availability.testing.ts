/**
 * Test-only wiring of the availability use cases and the temporary facade over
 * the catalog of the specs and an `OccupiedSlotsReader` of the caller's choice
 * (the same constructors the module uses, with no Nest container).
 */
import { CatalogService } from '../catalog/catalog.service';
import { Clock } from '../shared/application/clock.port';
import { BusinessClock } from './application/ports/business-clock.port';
import { OccupiedSlotsReader } from './application/ports/occupied-slots.reader';
import { GetAvailabilityUseCase } from './application/use-cases/get-availability.use-case';
import { GetPublicAvailabilityUseCase } from './application/use-cases/get-public-availability.use-case';
import { AvailabilityService } from './availability.service';
import { CatalogFacadeLookup } from './infrastructure/catalog/catalog-facade.lookup';
import { SystemBusinessClock } from './infrastructure/system-business-clock';

/** A system clock that always answers the same instant. */
export const fixedClock = (instant: Date): Clock => ({
  now: () => new Date(instant),
});

/** The business clock at `instant`; the timezone still comes from `BUSINESS_TIMEZONE`. */
export const businessClockAt = (instant: Date): BusinessClock =>
  new SystemBusinessClock(fixedClock(instant));

export function buildAvailability(
  catalog: CatalogService,
  occupiedSlots: OccupiedSlotsReader,
  clock: BusinessClock,
) {
  const lookup = new CatalogFacadeLookup(catalog);
  const getAvailability = new GetAvailabilityUseCase(lookup, occupiedSlots);
  return {
    lookup,
    getAvailability,
    getPublicAvailability: new GetPublicAvailabilityUseCase(
      lookup,
      clock,
      getAvailability,
    ),
    service: new AvailabilityService(getAvailability),
  };
}
