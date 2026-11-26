import type { Result } from '../../../shared/domain/result';
import type { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import type { BookingPlace } from '../../domain/booking';
import type { SelectedServices } from '../../domain/booking.rules';

export interface CatalogProfessional {
  id: string;
  name: string;
}

/**
 * What bookings asks the catalog. PROVISIONAL: the adapter wraps the
 * temporary `CatalogService` facade; it is replaced by the catalog use cases
 * when that facade is deleted (specs 17 and 26).
 *
 * Business failures come back as `Err` (always of kind `validation`, with the
 * "Error de validación" family of messages); a failure of the store throws.
 */
export interface BookingCatalog {
  /** An active location; the default one (the oldest active) without `locationId`. */
  getLocation(locationId?: string): Promise<Result<BookingPlace>>;
  /** Active locations, oldest first. */
  getActiveLocations(): Promise<BookingPlace[]>;
  /** The weekly schedule of a location. */
  getSchedule(locationId: string): Promise<Result<WeeklySchedule>>;
  /**
   * The services of the ids, back to back. Err for an empty, repeated or
   * unknown id. `professionals` are the ids that offer every service.
   */
  resolveServices(
    serviceIds: string[],
  ): Promise<Result<SelectedServices & { professionals: string[] }>>;
  /** An active professional, or null. */
  findProfessional(id: string): Promise<CatalogProfessional | null>;
  /** Whether an active professional works at the location. */
  worksAtLocation(professionalId: string, locationId: string): Promise<boolean>;
}

export const BOOKING_CATALOG = Symbol('BOOKING_CATALOG');
