import { Result, err, ok } from '../../shared/domain/result';
import type {
  DayOfWeek,
  WeeklySchedule,
} from '../../shared/domain/schedule/schedule';
import {
  buildDaySlots,
  dayOfWeekFromIsoDate,
  offeredStarts,
  slotsRequired,
} from '../../shared/domain/schedule/schedule.rules';
import {
  AvailabilityLocation,
  LocatedAvailability,
  OccupiedBooking,
  ServiceSelection,
} from './availability';
import { InvalidDate } from './availability.errors';
import { freeStartTimes, occupiedSlots } from './occupancy.rules';

/** The day of week of a real 'YYYY-MM-DD' date; Err(InvalidDate) for anything else. */
export function checkDate(date: unknown): Result<DayOfWeek, InvalidDate> {
  const dayOfWeek =
    typeof date === 'string' ? dayOfWeekFromIsoDate(date) : null;
  return dayOfWeek === null ? err(new InvalidDate()) : ok(dayOfWeek);
}

/** Whether the schedule has no bookable slot that day (nothing to look up). */
export function isClosedDay(
  dayOfWeek: DayOfWeek,
  schedule: WeeklySchedule,
): boolean {
  return buildDaySlots(dayOfWeek, schedule).length === 0;
}

export interface DayAvailabilityInput {
  date: string;
  dayOfWeek: DayOfWeek;
  location: AvailabilityLocation;
  selection: ServiceSelection;
  /** Bookings that block the agenda that day (cancelled ones never come here). */
  occupied: OccupiedBooking[];
}

/**
 * Free start times of a day, per professional offering ALL the services, for
 * the back-to-back block of the services. Occupancy is per professional, so a
 * booking at another location blocks the same hours here.
 */
export function dayAvailability(
  input: DayAvailabilityInput,
): LocatedAvailability {
  const { date, dayOfWeek, location, selection, occupied } = input;
  const { schedule } = location;
  const daySlots = buildDaySlots(dayOfWeek, schedule);
  const interval = schedule.slotIntervalMinutes;
  const required = slotsRequired(selection.totalDuration, interval);
  const offered = new Set(offeredStarts(dayOfWeek, schedule));

  return {
    date,
    closed: daySlots.length === 0,
    location: { id: location.id, name: location.name },
    services: selection.services.map(({ id, name, duration }) => ({
      id,
      name,
      duration,
    })),
    totalDuration: selection.totalDuration,
    professionals: selection.professionals.map((professional) => ({
      id: professional.id,
      name: professional.name,
      slots: freeStartTimes(
        daySlots,
        occupiedSlots(
          occupied.filter((b) => b.professionalId === professional.id),
        ),
        required,
        interval,
      ).filter((time) => offered.has(time)),
    })),
  };
}
