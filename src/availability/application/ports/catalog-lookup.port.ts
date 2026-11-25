import type { Result } from '../../../shared/domain/result';
import type {
  AvailabilityLocation,
  LocationSummary,
  OfferedService,
  PublicSettings,
  ServiceSelection,
} from '../../domain/availability';

/**
 * What availability asks the catalog. PROVISIONAL: the adapter wraps the
 * temporary `CatalogService` facade; it is replaced by the catalog use cases
 * when that facade is deleted (specs 17 and 26).
 *
 * Business failures come back as `Err`; a failure of the store throws.
 */
export interface CatalogLookup {
  /** An active location; the default one (the oldest active) without `locationId`. Err(LocationNotFound) otherwise. */
  getLocation(
    locationId: string | undefined,
  ): Promise<Result<AvailabilityLocation>>;

  /**
   * The services of the ids, back to back, and the professionals of that
   * location who offer all of them. Err(ServiceSelectionFailed) for an empty,
   * repeated or unknown id; Err(LocationNotFound) for an unknown location.
   */
  resolveServices(
    serviceIds: string[],
    locationId: string,
  ): Promise<Result<ServiceSelection>>;

  /** Active locations, oldest first (the first is the default). */
  getActiveLocations(): Promise<LocationSummary[]>;

  /** Settings of the public availability page (off when none is stored). */
  getPublicSettings(): Promise<PublicSettings>;

  /** Active services, the ones the public page may publish. */
  getActiveServices(): Promise<OfferedService[]>;
}

export const CATALOG_LOOKUP = Symbol('CATALOG_LOOKUP');
