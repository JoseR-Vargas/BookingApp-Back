import { DomainError } from '../../shared/domain/domain-error';

/** A required field of the request is missing (the message names which one). */
export class MissingBookingData extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The request does not describe a bookable slot; `detail` says why. */
export class InvalidBooking extends DomainError {
  constructor(readonly detail: string) {
    super('validation', `Error de validación: ${detail}`);
  }
}

/**
 * The professional already has a booking in one of the blocks. It stays a
 * `validation` failure (HTTP 400), as it always was.
 */
export class BlockAlreadyTaken extends DomainError {
  constructor(
    professionalName: string | undefined,
    date: string,
    time: string,
  ) {
    super(
      'validation',
      `Ya existe una reserva para ${professionalName} el ${date} a las ${time}`,
    );
  }
}

/** No booking matches: an unknown and a malformed cancel token answer alike. */
export class BookingNotFound extends DomainError {
  constructor() {
    super('not-found', 'Reserva no encontrada');
  }
}

/** The cancellation cutoff has passed. */
export class CancellationClosed extends DomainError {
  constructor() {
    super('conflict', 'Ya no es posible cancelar esta reserva');
  }
}

/** The business timezone is missing or invalid, so the cutoff cannot be judged. */
export class BusinessHoursUnverifiable extends DomainError {
  constructor() {
    super(
      'unavailable',
      'No se puede verificar el horario del negocio. Intenta más tarde.',
    );
  }
}
