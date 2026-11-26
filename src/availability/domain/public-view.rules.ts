import { Result, err, ok } from '../../shared/domain/result';
import {
  Availability,
  LocationSummary,
  OfferedService,
  PublicAvailabilityDay,
  PublishedService,
} from './availability';
import {
  LocationNotFound,
  PublishedServiceNotFound,
} from './availability.errors';

/** `date` plus `offset` days, as 'YYYY-MM-DD' (pure calendar arithmetic). */
export function addDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + offset));
  return moved.toISOString().slice(0, 10);
}

/** `count` consecutive dates starting today: the days the public page shows. */
export function publicDates(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, offset) => addDays(today, offset));
}

/** The active services the admin published; `serviceIds: null` publishes all. */
export function publishedServices(
  active: OfferedService[],
  serviceIds: string[] | null,
): PublishedService[] {
  return active
    .filter((service) => serviceIds === null || serviceIds.includes(service.id))
    .map(({ id, name, duration }) => ({ id, name, duration }));
}

/**
 * The location the days are computed for: the requested active one, or the
 * default (the first) when none is requested. Err(LocationNotFound) otherwise.
 */
export function pickLocation(
  active: LocationSummary[],
  locationId: string | undefined,
): Result<LocationSummary, LocationNotFound> {
  const found =
    locationId === undefined
      ? active[0]
      : active.find((candidate) => candidate.id === locationId);
  return found ? ok(found) : err(new LocationNotFound(locationId ?? ''));
}

/**
 * The service the days are computed for: the requested published one, or the
 * first published (null when none is published). Err(PublishedServiceNotFound)
 * for a requested one that is not published.
 */
export function pickService(
  published: PublishedService[],
  serviceId: string | undefined,
): Result<string | null, PublishedServiceNotFound> {
  if (serviceId !== undefined && !published.some((s) => s.id === serviceId)) {
    return err(new PublishedServiceNotFound(serviceId));
  }
  return ok(serviceId ?? published[0]?.id ?? null);
}

/**
 * One day of the public page: every start time with the professionals free at
 * it, sorted. Today's times that already passed are dropped, but only when the
 * business time is known (`nowTime`): without it no hour is ever hidden.
 */
export function publicDay(
  availability: Pick<Availability, 'date' | 'closed' | 'professionals'>,
  today: string,
  nowTime: string | null,
): PublicAvailabilityDay {
  const byTime = new Map<string, { id: string; name: string }[]>();
  for (const professional of availability.professionals) {
    for (const time of professional.slots) {
      if (availability.date === today && nowTime !== null && time <= nowTime) {
        continue;
      }
      const free = byTime.get(time) ?? [];
      free.push({ id: professional.id, name: professional.name });
      byTime.set(time, free);
    }
  }
  return {
    date: availability.date,
    closed: availability.closed,
    times: [...byTime.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, professionals]) => ({ time, professionals })),
  };
}
