import { DomainError } from './domain-error';

/** The message of a business over its storage quota. */
export const STORAGE_LIMIT_MESSAGE =
  'Este negocio alcanzó el límite de almacenamiento de su plan.';

/** The business is over its storage quota: it adds no bookings and no photos (spec 22). */
export class StorageLimitReached extends DomainError {
  constructor() {
    super('forbidden', STORAGE_LIMIT_MESSAGE);
  }
}
