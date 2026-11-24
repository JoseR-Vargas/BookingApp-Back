import { DayOfWeek, WeeklySchedule } from './schedule';

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

/** Minutes since midnight of an 'H:mm' / 'HH:mm' time, or null if invalid. */
export function toMinutes(time: string): number | null {
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

/** Bookable start times of a day: every interval from opening to closing. */
export function buildDaySlots(
  dayOfWeek: DayOfWeek,
  schedule: WeeklySchedule,
): string[] {
  const day = schedule.weekly[dayOfWeek];
  if (day.closed) {
    return [];
  }
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === null || close === null) {
    return [];
  }
  const slots: string[] = [];
  for (let start = open; start < close; start += schedule.slotIntervalMinutes) {
    slots.push(toTime(start));
  }
  return slots;
}

/**
 * Single source of the start times offered to the public on a day: the day's
 * own `starts` list when the admin set one, otherwise the grid slots whose
 * offset from opening is a multiple of `startIntervalMinutes`.
 * Occupancy stays on the 30-minute grid; this only chooses which starts exist.
 */
export function offeredStarts(
  dayOfWeek: DayOfWeek,
  schedule: WeeklySchedule,
): string[] {
  const day = schedule.weekly[dayOfWeek];
  if (day.closed) {
    return [];
  }
  const open = toMinutes(day.open);
  if (open === null) {
    return [];
  }
  if (day.starts) {
    const grid = new Set(buildDaySlots(dayOfWeek, schedule));
    return day.starts.filter((time) => grid.has(time));
  }
  return buildDaySlots(dayOfWeek, schedule).filter(
    (slot) =>
      ((toMinutes(slot) as number) - open) % schedule.startIntervalMinutes ===
      0,
  );
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
