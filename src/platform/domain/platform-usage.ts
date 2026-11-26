// What every business of the installation did (spec 25). Counts and dates
// only: the owner of the system never reads the data of a client.

/** The bookings of every business in a period, and the last use of each one. */
export interface PlatformUsage {
  /** The bookings created in the period, by business id. */
  bookingsByBusiness: Map<string, number>;
  /** The last booking of every business, by business id. */
  lastUseByBusiness: Map<string, Date>;
}

/** How many professionals, services and locations a business has. */
export interface PlatformCatalogSize {
  professionals: number;
  services: number;
  locations: number;
}

/** One line of the breakdown: who, and how many bookings. */
export interface BreakdownEntry {
  /** The id of the professional, the service or the location. */
  id: string;
  /** How many bookings it has in the period. */
  bookings: number;
}

/** The bookings of a business, counted by professional, service and location. */
export interface PlatformBreakdown {
  /** The bookings of each professional. */
  professionals: BreakdownEntry[];
  /** The bookings of each service. */
  services: BreakdownEntry[];
  /** The bookings of each location. */
  locations: BreakdownEntry[];
}
