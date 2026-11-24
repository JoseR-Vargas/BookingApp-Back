import { DomainError } from '../../shared/domain/domain-error';

/** User-facing messages of the location rules (the ones the API has always sent). */
export const LOCATION_MESSAGES = {
  name: 'El nombre del local es obligatorio (máximo 80 caracteres).',
  address: 'La dirección del local no puede superar los 200 caracteres.',
  active: 'El estado del local debe ser verdadero o falso.',
  lastActive: 'Debe quedar al menos un local activo.',
  noEditableField:
    'body must include at least one editable field (name, address, active)',
  publishedServices: 'Alguno de los servicios publicados no existe.',
} as const;

/** An unknown or inactive location id. */
export class LocationNotFound extends DomainError {
  constructor(readonly locationId: string) {
    super('not-found', `Location "${locationId}" not found`);
  }
}

/**
 * The change would leave no active location. It is a `validation` failure
 * (HTTP 400): that is the answer the API has always given, and the contract
 * of the routes does not change.
 */
export class LastActiveLocation extends DomainError {
  constructor() {
    super('validation', LOCATION_MESSAGES.lastActive);
  }
}

/** The body of a location (name, address, active) breaks a rule. */
export class InvalidLocationData extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The weekly schedule, the start interval or a day's `starts` break a rule. */
export class InvalidSchedule extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The settings of the public availability page break a rule. */
export class InvalidPublicAvailability extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The settings publish a service that does not exist. */
export class UnknownPublishedService extends DomainError {
  constructor() {
    super('validation', LOCATION_MESSAGES.publishedServices);
  }
}
