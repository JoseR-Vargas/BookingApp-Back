// ===== ERRORES DE PLANES Y COBRO =====
import { DomainError } from '../../shared/domain/domain-error';

/** A plan limit was reached; the message names the limit and the plan that solves it. */
export class PlanLimitReached extends DomainError {
  constructor(message: string) {
    super('forbidden', message);
  }
}

/** The subscription ended (canceled): the business takes no new bookings. */
export const SUBSCRIPTION_ENDED_MESSAGE =
  'La suscripción de este negocio terminó: no se aceptan reservas nuevas hasta que contrates un plan.';

export class SubscriptionEnded extends DomainError {
  constructor() {
    super('forbidden', SUBSCRIPTION_ENDED_MESSAGE);
  }
}

/** The business has no subscription to change. */
export class SubscriptionNotFound extends DomainError {
  constructor() {
    super('not-found', 'Este negocio no tiene una suscripción.');
  }
}

/** The requested change does not apply to the state of the subscription. */
export class InvalidSubscriptionTransition extends DomainError {
  constructor(message: string) {
    super('conflict', message);
  }
}

/** The plan does not exist or cannot be bought. */
export class InvalidPlan extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** A webhook arrived without a valid signature. */
export class InvalidWebhookSignature extends DomainError {
  constructor() {
    super('unauthorized', 'Firma de webhook inválida.');
  }
}

/** A webhook arrived with a valid signature but a body that cannot be understood. */
export class InvalidPaymentEvent extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}
