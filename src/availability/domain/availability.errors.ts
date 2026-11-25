import { DomainError } from '../../shared/domain/domain-error';

/** The date of the query is not a real 'YYYY-MM-DD' calendar date. */
export class InvalidDate extends DomainError {
  constructor() {
    super('validation', 'date must be a valid YYYY-MM-DD date');
  }
}

const SERVICE_IDS_MESSAGES = {
  missing: 'serviceIds is required',
  malformed: 'serviceIds must be a comma-separated list of service ids',
} as const;

/** `serviceIds` is absent, or the list has an empty id. */
export class InvalidServiceIds extends DomainError {
  constructor(reason: keyof typeof SERVICE_IDS_MESSAGES) {
    super('validation', SERVICE_IDS_MESSAGES[reason]);
  }
}

/** An unknown or inactive location. */
export class LocationNotFound extends DomainError {
  constructor(readonly locationId: string) {
    super('not-found', `Location "${locationId}" not found`);
  }
}

/** The service is not in the list the public page publishes (or does not exist). */
export class PublishedServiceNotFound extends DomainError {
  constructor(serviceId: string) {
    super('not-found', `Service "${serviceId}" not found`);
  }
}

export type ServiceSelectionFailure = 'empty' | 'duplicate' | 'unknown';

const SELECTION_MESSAGES: Record<
  ServiceSelectionFailure,
  (serviceId?: string) => string
> = {
  empty: () => 'debes seleccionar al menos un servicio',
  duplicate: (serviceId) => `el servicio ${serviceId} está repetido`,
  unknown: (serviceId) => `Service "${serviceId}" not found`,
};

/**
 * The service ids cannot become a selection: an unknown id is a `not-found`
 * (HTTP 404), an empty or repeated list is a `validation` failure (HTTP 400).
 */
export class ServiceSelectionFailed extends DomainError {
  constructor(
    readonly failure: ServiceSelectionFailure,
    readonly serviceId?: string,
  ) {
    super(
      failure === 'unknown' ? 'not-found' : 'validation',
      SELECTION_MESSAGES[failure](serviceId),
    );
  }
}
