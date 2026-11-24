/**
 * The locations a professional may be assigned to. TEMPORARY: it is answered
 * from the locations collection until `locations` is migrated (spec 12), which
 * will answer it itself.
 */
export interface LocationDirectory {
  /** Ids of the active locations, oldest first. */
  activeIds(): Promise<string[]>;
  /** Id of the default location (the oldest active one); null when none is active. */
  defaultId(): Promise<string | null>;
}

export const LOCATION_DIRECTORY = Symbol('LOCATION_DIRECTORY');
