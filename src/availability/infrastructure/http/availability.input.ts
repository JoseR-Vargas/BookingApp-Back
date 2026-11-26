import { Result, err, ok } from '../../../shared/domain/result';
import { checkDate } from '../../domain/day-availability.rules';
import {
  InvalidDate,
  InvalidServiceIds,
} from '../../domain/availability.errors';

export interface AvailabilityQuery {
  date: string;
  serviceIds: string[];
  locationId?: string;
}

/** A query string value that is a non-blank string, trimmed; anything else is absent. */
export function cleanQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

/** Splits `a,b,c` into trimmed ids; anything else is a client error. */
function parseServiceIds(value: unknown): Result<string[], InvalidServiceIds> {
  if (typeof value !== 'string' || value.trim() === '') {
    return err(new InvalidServiceIds('missing'));
  }
  const ids = value.split(',').map((id) => id.trim());
  return ids.some((id) => id === '')
    ? err(new InvalidServiceIds('malformed'))
    : ok(ids);
}

/**
 * The query of `GET /availability`. The date is checked before the service
 * ids, so a request with both wrong answers the date message, as it always did.
 */
export function parseAvailabilityQuery(
  date: unknown,
  serviceIds: unknown,
  locationId: unknown,
): Result<AvailabilityQuery, InvalidDate | InvalidServiceIds> {
  const checked = checkDate(date);
  if (!checked.ok) return checked;
  const ids = parseServiceIds(serviceIds);
  if (!ids.ok) return ids;
  return ok({
    date: date as string,
    serviceIds: ids.value,
    locationId: cleanQueryValue(locationId),
  });
}
