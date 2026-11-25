/**
 * What the modules that are not migrated yet still import from here
 * (`bookings`, `availability`). The locations themselves live in
 * `domain/location*.ts`, `application/` and `infrastructure/` (spec 12).
 *
 * @deprecated TEMPORARY, deleted when `bookings` and `availability` migrate
 * (spec 13): they will call the location use cases and handle the domain
 * errors instead of this exception.
 */

/** An unknown or inactive location id; controllers map it to a 404. */
export class LocationNotFoundError extends Error {
  constructor(readonly locationId: string) {
    super(`Location "${locationId}" not found`);
    this.name = 'LocationNotFoundError';
  }
}

export { toWeeklySchedule } from './domain/location.rules';
