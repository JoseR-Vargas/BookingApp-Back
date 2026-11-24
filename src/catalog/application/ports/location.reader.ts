import { Location } from '../../domain/location';

/** Reads the locations. */
export interface LocationReader {
  /**
   * Every location (active or not) in creation order. A store that was never
   * migrated reads as one virtual active "principal" with the legacy schedule,
   * so reads never fail between a deploy and the first startup migration.
   */
  list(): Promise<Location[]>;
  /** Whether the store holds at least one location (the virtual "principal" does not count). */
  hasAny(): Promise<boolean>;
}

export const LOCATION_READER = Symbol('LOCATION_READER');
