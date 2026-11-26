// ===== REGLAS DE IMPACTO DE HORARIO =====
// Whether a booking still fits a schedule. Pure: the schedule and the booking are data, the
// timezone is a parameter (never read from the environment here).

import { WeeklySchedule } from '../../shared/domain/schedule/schedule';
import {
  dayOfWeekFromIsoDate,
  toMinutes,
} from '../../shared/domain/schedule/schedule.rules';
import { getBusinessNow } from '../../shared/domain/business-time';

/** The part of a booking needed to tell whether a schedule still fits it. */
export interface ScheduledBooking {
  date: string;
  time: string;
  slots?: string[];
  /** Absent on bookings created before locations existed. */
  location?: { id: string };
}

/** Restricts the count to the bookings of one location. */
export interface LocationScope {
  locationId: string;
  /** Bookings without a stored location belong to this one. */
  defaultLocationId: string;
}

/** Today's 'YYYY-MM-DD': business timezone if valid, otherwise the UTC date. */
export function currentBusinessDate(
  instant: Date,
  timezone: string | undefined,
): string {
  return (
    getBusinessNow(timezone, instant)?.date ??
    instant.toISOString().slice(0, 10)
  );
}

/**
 * Whether the booking's day is closed in `schedule` or any slot it occupies
 * falls outside the open window [open, close). Bookings without slots (legacy
 * data) are judged by their start time. Invalid dates are never counted.
 */
export function isOutsideSchedule(
  booking: ScheduledBooking,
  schedule: WeeklySchedule,
): boolean {
  const dayOfWeek = dayOfWeekFromIsoDate(booking.date);
  if (dayOfWeek === null) {
    return false;
  }
  const day = schedule.weekly[dayOfWeek];
  if (day.closed) {
    return true;
  }
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  const times = booking.slots?.length ? booking.slots : [booking.time];
  return times.some((time) => {
    const start = toMinutes(time);
    return (
      start === null ||
      open === null ||
      close === null ||
      start < open ||
      start >= close
    );
  });
}
