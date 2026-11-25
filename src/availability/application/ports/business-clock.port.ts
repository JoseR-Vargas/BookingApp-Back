/** The business's "now": today's date and, when the zone is known, the time. */
export interface BusinessMoment {
  /** 'YYYY-MM-DD': the date at the business, or the UTC date without a timezone. */
  today: string;
  /** 'HH:MM' at the business; null when there is no valid timezone (no hour is ever hidden). */
  time: string | null;
  /**
   * Seconds into that minute (the clock has minute resolution; every zone
   * offset is whole minutes, so these are the UTC seconds). Absent means 0.
   */
  seconds?: number;
}

/** The business's clock, injected so use cases never read the system time or the environment. */
export interface BusinessClock {
  now(): BusinessMoment;
}

export const BUSINESS_CLOCK = Symbol('BUSINESS_CLOCK');
