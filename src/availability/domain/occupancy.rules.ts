import { toMinutes } from '../../shared/domain/schedule/schedule.rules';

/** The part of a booking that blocks the agenda: the slots it occupies. */
export interface OccupyingBooking {
  slots: string[];
}

/** Slot start times blocked by the given (non-cancelled) bookings. */
export function occupiedSlots(bookings: OccupyingBooking[]): Set<string> {
  return new Set(bookings.flatMap((booking) => booking.slots));
}

/**
 * Start times where `required` contiguous day slots exist and are all free.
 * Contiguity prevents a window from running past the closing time.
 */
export function freeStartTimes(
  daySlots: string[],
  occupied: Set<string>,
  required: number,
  intervalMinutes: number,
): string[] {
  const minutes = daySlots.map((slot) => toMinutes(slot) as number);
  return daySlots.filter((_, index) => {
    for (let offset = 0; offset < required; offset++) {
      const current = index + offset;
      if (current >= daySlots.length || occupied.has(daySlots[current])) {
        return false;
      }
      if (
        offset > 0 &&
        minutes[current] - minutes[current - 1] !== intervalMinutes
      ) {
        return false;
      }
    }
    return true;
  });
}

/**
 * The `required` consecutive day slots a window starting at `time` occupies,
 * or null when it does not fit (off the slot grid, crossing the closing time,
 * or a closed day).
 */
export function windowSlots(
  daySlots: string[],
  time: string,
  required: number,
  intervalMinutes: number,
): string[] | null {
  const validStarts = freeStartTimes(
    daySlots,
    new Set(),
    required,
    intervalMinutes,
  );
  if (!validStarts.includes(time)) {
    return null;
  }
  const start = daySlots.indexOf(time);
  return daySlots.slice(start, start + required);
}
