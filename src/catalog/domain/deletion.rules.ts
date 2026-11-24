import { Result, err, ok } from '../../shared/domain/result';
import {
  ProfessionalHasUpcomingBookingsError,
  ProfessionalIsSoleProviderError,
  ServiceHasUpcomingBookingsError,
} from './catalog.errors';
import { Service } from './service';

/**
 * Deletion rules: pure functions fed with the data they need (counts, the
 * services a professional offers); the use case collects it through the ports.
 */

/** A professional cannot go while it has confirmed bookings from today on. */
export function ensureProfessionalHasNoUpcomingBookings(
  name: string,
  upcoming: number,
): Result<void, ProfessionalHasUpcomingBookingsError> {
  return upcoming > 0
    ? err(new ProfessionalHasUpcomingBookingsError(name, upcoming))
    : ok(undefined);
}

/** A professional cannot go while it is the only one of any service (the first one is named). */
export function ensureProfessionalNotSoleProvider(
  name: string,
  offered: readonly Service[],
): Result<void, ProfessionalIsSoleProviderError> {
  const sole = offered.find((service) => service.professionals.length === 1);
  return sole
    ? err(new ProfessionalIsSoleProviderError(name, sole.name))
    : ok(undefined);
}

/** A service cannot go while it has confirmed bookings from today on. */
export function ensureServiceHasNoUpcomingBookings(
  name: string,
  upcoming: number,
): Result<void, ServiceHasUpcomingBookingsError> {
  return upcoming > 0
    ? err(new ServiceHasUpcomingBookingsError(name, upcoming))
    : ok(undefined);
}
