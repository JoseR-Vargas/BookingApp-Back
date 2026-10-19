import { DayOfWeek, WeeklySchedule } from '../catalog/catalog.config';

export interface OccupyingBooking {
  time: string;
  service?: { duration?: number } | null;
  status?: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/** Day of week (0 = Sunday) of a real calendar date 'YYYY-MM-DD', or null. */
export function dayOfWeekFromIsoDate(value: string): DayOfWeek | null {
  const match = ISO_DATE.exec(value ?? '');
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.getUTCDay() as DayOfWeek;
}

function toMinutes(time: string): number | null {
  const match = TIME.exec(time ?? '');
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Bookable start times of a day, skipping the lunch break. */
export function buildDaySlots(
  dayOfWeek: DayOfWeek,
  schedule: WeeklySchedule,
): string[] {
  const day = schedule.weekly[dayOfWeek];
  if (day.closed) {
    return [];
  }
  const { slotIntervalMinutes: interval, lunchBreak } = schedule;
  const lunchStart = lunchBreak.start * 60;
  const lunchEnd = lunchBreak.end * 60;
  const slots: string[] = [];
  for (let start = day.open * 60; start < day.close * 60; start += interval) {
    if (start >= lunchStart && start < lunchEnd) {
      continue;
    }
    slots.push(toTime(start));
  }
  return slots;
}

/** Consecutive slots a duration occupies; invalid durations count as one. */
export function slotsRequired(
  durationMinutes: number,
  intervalMinutes: number,
): number {
  if (
    typeof durationMinutes !== 'number' ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return 1;
  }
  return Math.ceil(durationMinutes / intervalMinutes);
}

/** Slot start times blocked by the given bookings. */
export function occupiedSlots(
  bookings: OccupyingBooking[],
  intervalMinutes: number,
): Set<string> {
  const occupied = new Set<string>();
  for (const booking of bookings) {
    if (booking.status === 'cancelled') {
      continue;
    }
    const start = toMinutes(booking.time);
    if (start === null) {
      continue;
    }
    const count = slotsRequired(
      booking.service?.duration as number,
      intervalMinutes,
    );
    for (let i = 0; i < count; i++) {
      occupied.add(toTime(start + i * intervalMinutes));
    }
  }
  return occupied;
}

/**
 * Start times where `required` contiguous day slots exist and are all free.
 * Contiguity prevents crossing the lunch break or closing time.
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
