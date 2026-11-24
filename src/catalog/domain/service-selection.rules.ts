import { Result, err, ok } from '../../shared/domain/result';
import { ServiceSelectionFailedError } from './catalog.errors';
import { Professional } from './professional';
import { locationIdsOf } from './professional.rules';
import { Service } from './service';

/** A validated set of catalog services performed back-to-back. */
export interface ServiceSelection {
  /** Services in the order the client picked them. */
  services: Service[];
  /** Professionals that offer every selected service. */
  professionals: Professional[];
  totalPrice: number;
  totalDuration: number;
}

/** The list must not be empty and must not repeat an id (the first repeated one is named). */
export function checkServiceIds(
  serviceIds: string[],
): Result<string[], ServiceSelectionFailedError> {
  if (serviceIds.length === 0) {
    return err(new ServiceSelectionFailedError('empty'));
  }
  const duplicate = serviceIds.find(
    (id, index) => serviceIds.indexOf(id) !== index,
  );
  return duplicate !== undefined
    ? err(new ServiceSelectionFailedError('duplicate', duplicate))
    : ok(serviceIds);
}

/** The services in the order the ids were given; the first id without a service fails. */
export function pickServices(
  serviceIds: string[],
  found: readonly Service[],
): Result<Service[], ServiceSelectionFailedError> {
  const services: Service[] = [];
  for (const id of serviceIds) {
    const service = found.find((candidate) => candidate.id === id);
    if (!service) {
      return err(new ServiceSelectionFailedError('unknown', id));
    }
    services.push(service);
  }
  return ok(services);
}

/** Where the selection is for: only the professionals working there are offered. */
export interface SelectionLocation {
  locationId: string;
  defaultLocationId: string;
}

/**
 * The selection of `services`: the professionals (already filtered to the
 * active ones) that perform all of them, optionally only at one location,
 * and the totals.
 */
export function buildServiceSelection(
  services: Service[],
  activeProfessionals: readonly Professional[],
  location?: SelectionLocation,
): ServiceSelection {
  return {
    services,
    professionals: activeProfessionals
      .filter((professional) =>
        services.every((s) => s.professionals.includes(professional.id)),
      )
      .filter(
        (professional) =>
          location === undefined ||
          locationIdsOf(professional, location.defaultLocationId).includes(
            location.locationId,
          ),
      ),
    totalPrice: services.reduce((sum, s) => sum + s.price, 0),
    totalDuration: services.reduce((sum, s) => sum + s.duration, 0),
  };
}
