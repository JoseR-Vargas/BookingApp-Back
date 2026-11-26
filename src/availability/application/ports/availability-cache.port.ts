// ===== PUERTO: CACHÉ DE DISPONIBILIDAD =====
// Short-lived answers of `GetAvailabilityUseCase`, kept in the memory of the
// process so a burst of visits does not become a burst of database operations
// (spec 22). Entries belong to the business in force and are never shared.

import { AvailabilityInvalidator } from '../../../shared/application/availability-invalidator.port';
import { LocatedAvailability } from '../../domain/availability';

/** What the answer of a day depends on, besides the business. */
export interface AvailabilityKey {
  date: string;
  /** In the order the client picked them: the block is back to back. */
  serviceIds: readonly string[];
  /** Undefined means "the default location". */
  locationId?: string;
}

export interface AvailabilityCache extends AvailabilityInvalidator {
  /** A copy of the live answer, or undefined. */
  get(key: AvailabilityKey): LocatedAvailability | undefined;
  /**
   * A token to take BEFORE computing an answer. `set` drops the answer if the
   * business was invalidated since, so a read that raced a write never stores
   * stale data.
   */
  stamp(): number;
  set(key: AvailabilityKey, value: LocatedAvailability, stamp: number): void;
}

export const AVAILABILITY_CACHE = Symbol('AVAILABILITY_CACHE');
