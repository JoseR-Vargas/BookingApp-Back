// The periods of the owner panel (spec 25): the day and the month the
// aggregates are counted on. Pure: the moment comes in, the boundaries come
// out. Everything is UTC, because the metrics of the installation are read
// across businesses and each one has its own time zone.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first millisecond of the day of `now` (UTC). */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** The first millisecond of the next day (UTC). */
export function endOfUtcDay(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + DAY_MS);
}

/** The first millisecond of the month of `now` (UTC). */
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The first millisecond of the next month (UTC). */
export function endOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** The same day, `days` days later. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Whole days left until `until`, rounded up; 0 once the time is over.
 * `null` when there is no deadline.
 */
export function daysLeft(until: Date | null, now: Date): number | null {
  if (until === null) return null;
  const msLeft = until.getTime() - now.getTime();
  return msLeft <= 0 ? 0 : Math.ceil(msLeft / DAY_MS);
}

/** A period of time, half open: `[start, end)`. */
export interface Period {
  start: Date;
  end: Date;
}

/** The day of `now` (UTC). */
export function dayPeriod(now: Date): Period {
  return { start: startOfUtcDay(now), end: endOfUtcDay(now) };
}

/** The month of `now` (UTC). */
export function monthPeriod(now: Date): Period {
  return { start: startOfUtcMonth(now), end: endOfUtcMonth(now) };
}
