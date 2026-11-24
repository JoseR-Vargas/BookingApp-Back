import { DomainError } from '../../shared/domain/domain-error';

/** User-facing messages of the catalog rules. */
export const CATALOG_MESSAGES = {
  professionalLocations:
    'El profesional debe trabajar en al menos un local activo.',
  noActiveLocation: 'Debe quedar al menos un local activo.',
  photoNotFound: 'Photo not found',
} as const;

/** A field of a professional or a service breaks its rule. */
export class InvalidCatalogDataError extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The professional's locations are not a list of existing, active locations. */
export class InvalidProfessionalLocationsError extends DomainError {
  constructor() {
    super('validation', CATALOG_MESSAGES.professionalLocations);
  }
}

/** There is no active location to take as the default. */
export class NoActiveLocationError extends DomainError {
  constructor() {
    super('validation', CATALOG_MESSAGES.noActiveLocation);
  }
}

export class ProfessionalNotFoundError extends DomainError {
  constructor(id: string) {
    super('not-found', `Professional "${id}" not found`);
  }
}

export class ServiceNotFoundError extends DomainError {
  constructor(id: string) {
    super('not-found', `Service "${id}" not found`);
  }
}

export class PhotoNotFoundError extends DomainError {
  constructor() {
    super('not-found', CATALOG_MESSAGES.photoNotFound);
  }
}

const plural = (count: number): string => (count === 1 ? '' : 's');

/** A professional with confirmed bookings from today on cannot be deleted. */
export class ProfessionalHasUpcomingBookingsError extends DomainError {
  constructor(name: string, upcoming: number) {
    const s = plural(upcoming);
    super(
      'conflict',
      `No se puede eliminar a ${name}: tiene ${upcoming} reserva${s} futura${s} confirmada${s}. Cancélalas o desactiva al profesional.`,
    );
  }
}

/** A professional that is the only one of a service cannot be deleted. */
export class ProfessionalIsSoleProviderError extends DomainError {
  constructor(name: string, serviceName: string) {
    super(
      'conflict',
      `No se puede eliminar a ${name}: el servicio "${serviceName}" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.`,
    );
  }
}

/** A service with confirmed bookings from today on cannot be deleted. */
export class ServiceHasUpcomingBookingsError extends DomainError {
  constructor(name: string, upcoming: number) {
    const s = plural(upcoming);
    super(
      'conflict',
      `No se puede eliminar el servicio "${name}": tiene ${upcoming} reserva${s} futura${s} confirmada${s}. Cancélalas o desactiva el servicio.`,
    );
  }
}

export type ServiceSelectionFailure = 'empty' | 'duplicate' | 'unknown';

const SELECTION_MESSAGES: Record<
  ServiceSelectionFailure,
  (serviceId?: string) => string
> = {
  empty: () => 'debes seleccionar al menos un servicio',
  duplicate: (serviceId) => `el servicio ${serviceId} está repetido`,
  unknown: (serviceId) => `el servicio ${serviceId} no existe`,
};

/** A list of service ids that cannot become a selection. */
export class ServiceSelectionFailedError extends DomainError {
  constructor(
    readonly failure: ServiceSelectionFailure,
    readonly serviceId?: string,
  ) {
    super('validation', SELECTION_MESSAGES[failure](serviceId));
  }
}
