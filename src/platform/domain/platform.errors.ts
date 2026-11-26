// The failures of the owner panel (spec 25). They are `DomainError`s, so the
// one filter of the project turns them into the matching HTTP answer. The
// messages are in Spanish: they are shown to the owner of the system.

import { PlanId, planById } from '../../billing/domain/plans';
import { DomainError } from '../../shared/domain/domain-error';

/** The message of a business that does not exist. */
export const PLATFORM_BUSINESS_NOT_FOUND_MESSAGE = 'Negocio no encontrado.';

/** The business does not exist (or the id is not a business id). */
export class PlatformBusinessNotFound extends DomainError {
  constructor(message: string = PLATFORM_BUSINESS_NOT_FOUND_MESSAGE) {
    super('not-found', message);
  }
}

/** The installation cannot lose its last business that answers. */
export class LastBusinessCannotBeSuspended extends DomainError {
  constructor() {
    super(
      'conflict',
      'No se puede suspender el único negocio activo del sistema.',
    );
  }
}

/** The business is suspended already. */
export class BusinessAlreadySuspended extends DomainError {
  constructor() {
    super('conflict', 'Este negocio ya está suspendido.');
  }
}

/** The business answers requests already and its trial is not expired. */
export class BusinessAlreadyActive extends DomainError {
  constructor() {
    super('conflict', 'Este negocio ya está activo.');
  }
}

/** The business has no trial to extend. */
export class BusinessHasNoTrial extends DomainError {
  constructor() {
    super(
      'conflict',
      'Este negocio no tiene una prueba gratuita para extender.',
    );
  }
}

/** The trial is over: the business must be reactivated first. */
export class TrialAlreadyExpired extends DomainError {
  constructor() {
    super(
      'conflict',
      'La prueba de este negocio ya venció: reactívalo antes de extenderla.',
    );
  }
}

/** The days of the extension are not a whole number of days in range. */
export class InvalidTrialDays extends DomainError {
  constructor() {
    super(
      'validation',
      'Los días de la prueba deben ser un número entero entre 1 y 365.',
    );
  }
}

/** The plan does not exist (spec 23). */
export class UnknownPlan extends DomainError {
  constructor() {
    super('validation', 'El plan elegido no existe.');
  }
}

/** The business already pays that plan: there is no change to record. */
export class BusinessAlreadyOnPlan extends DomainError {
  constructor(planId: PlanId) {
    super(
      'conflict',
      `Este negocio ya está en el plan ${planById(planId).name}.`,
    );
  }
}
