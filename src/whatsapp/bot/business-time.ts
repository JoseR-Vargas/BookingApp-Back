/** Wall-clock "now" in the business timezone. */
export interface BusinessNow {
  /** YYYY-MM-DD */
  date: string;
  hour: number;
  minute: number;
}

/**
 * Current date/time in an IANA timezone, or null when the timezone is unset
 * or unknown. Callers must treat null as "do not book blind".
 */
export function getBusinessNow(
  timezone: string | undefined,
  instant: Date = new Date(),
): BusinessNow | null {
  const zone = timezone?.trim();
  if (!zone) {
    return null;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(instant);
    const part = (type: string) =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      hour: Number(part('hour')),
      minute: Number(part('minute')),
    };
  } catch {
    // Intl throws RangeError for an unknown timeZone.
    return null;
  }
}

/** `count` consecutive calendar dates (YYYY-MM-DD) starting at `from`. */
export function nextDates(from: string, count: number): string[] {
  const [year, month, day] = from.split('-').map(Number);
  return Array.from({ length: count }, (_, offset) =>
    new Date(Date.UTC(year, month - 1, day + offset))
      .toISOString()
      .slice(0, 10),
  );
}

/**
 * Removes start times that already started. Slots are hourly, so for today
 * every start time at or before the current hour is dropped.
 */
export function dropPastTimes(
  date: string,
  times: string[],
  now: BusinessNow,
): string[] {
  if (date < now.date) {
    return [];
  }
  if (date > now.date) {
    return times;
  }
  return times.filter((time) => Number(time.split(':')[0]) > now.hour);
}
