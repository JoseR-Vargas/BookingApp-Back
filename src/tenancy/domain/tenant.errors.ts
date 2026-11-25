// ===== ERRORES DEL NEGOCIO =====
// The failures of the rules of a business. They are `DomainError`s, so the
// one filter of the project turns them into the matching HTTP answer.

import { DomainError } from '../../shared/domain/domain-error';

/** The message of a business that does not exist (or whose slug is invalid). */
export const TENANT_NOT_FOUND_MESSAGE = 'Negocio no encontrado';

/** The message of a business that is suspended. */
export const TENANT_SUSPENDED_MESSAGE = 'Este negocio no está disponible.';

/** The business does not exist, or the slug has no valid shape. */
export class TenantNotFound extends DomainError {
  constructor(message: string = TENANT_NOT_FOUND_MESSAGE) {
    super('not-found', message);
  }
}

/** The business exists but does not answer requests. */
export class TenantSuspended extends DomainError {
  constructor(message: string = TENANT_SUSPENDED_MESSAGE) {
    super('forbidden', message);
  }
}

/** The slug does not have the shape a business needs. */
export class InvalidTenantSlug extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The slug belongs to the application and no business may take it. */
export class ReservedTenantSlug extends DomainError {
  constructor(slug: string) {
    super('validation', `El slug "${slug}" está reservado.`);
  }
}

/** Another business already uses the slug. */
export class DuplicateTenantSlug extends DomainError {
  constructor(slug: string) {
    super('conflict', `El slug "${slug}" ya está en uso.`);
  }
}

/** The name of the business is empty or too long. */
export class InvalidTenantName extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}
