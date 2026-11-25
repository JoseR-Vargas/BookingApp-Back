import { Result, err, ok } from '../../shared/domain/result';
import { DayOfWeek, DaySchedule } from '../../shared/domain/schedule/schedule';
import { isBody } from './field.rules';
import { InvalidSchedule } from './location.errors';

/**
 * Validation of the schedule of a location (week, start interval and per-day
 * starts) from an untrusted body. Every parser answers the normalised value or
 * the first broken rule; the messages are the ones the API has always sent.
 */

type ScheduleResult<T> = Result<T, InvalidSchedule>;
type Week = Record<DayOfWeek, DaySchedule>;

const fail = (message: string): ScheduleResult<never> =>
  err(new InvalidSchedule(message));

/** 'HH:mm' on the 30-minute grid, from 00:00 to 23:30. */
const GRID_TIME = /^([01]\d|2[0-3]):(00|30)$/;
/** Any 'HH:mm' time; the grid check is a separate (range) error. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export const SCHEDULE_MESSAGES = {
  startsList:
    'Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.',
  startsRange:
    'Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.',
  invalidStartInterval:
    'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
} as const;

/** Optional per-day `starts`: undefined/null = none; otherwise sorted, validated. */
function parseStarts(
  starts: unknown,
  open: string,
  close: string,
): ScheduleResult<string[] | undefined> {
  if (starts === undefined || starts === null) {
    return ok(undefined);
  }
  if (
    !Array.isArray(starts) ||
    starts.length === 0 ||
    starts.some((time) => typeof time !== 'string' || !HH_MM.test(time)) ||
    new Set(starts).size !== starts.length
  ) {
    return fail(SCHEDULE_MESSAGES.startsList);
  }
  const times = starts as string[];
  if (
    times.some((time) => !GRID_TIME.test(time) || time < open || time >= close)
  ) {
    return fail(SCHEDULE_MESSAGES.startsRange);
  }
  return ok([...times].sort());
}

function parseDay(value: unknown, day: DayOfWeek): ScheduleResult<DaySchedule> {
  if (!isBody(value)) {
    return fail(`day ${day} must be an object`);
  }
  const { closed, open, close, starts } = value;
  if (typeof closed !== 'boolean') {
    return fail(`day ${day}: closed must be a boolean`);
  }
  if (closed) {
    return ok({ closed: true });
  }
  for (const [field, time] of [
    ['open', open],
    ['close', close],
  ] as const) {
    if (typeof time !== 'string' || !GRID_TIME.test(time)) {
      return fail(
        `day ${day}: ${field} must be an HH:mm time on a 30-minute step between 00:00 and 23:30`,
      );
    }
  }
  // Same-width HH:mm strings compare chronologically.
  if ((open as string) >= (close as string)) {
    return fail(`day ${day}: open must be earlier than close`);
  }
  const parsed = parseStarts(starts, open as string, close as string);
  if (!parsed.ok) return parsed;
  return ok({
    closed: false,
    open: open as string,
    close: close as string,
    ...(parsed.value ? { starts: parsed.value } : {}),
  });
}

/** Validates `{ weekly }`; all 7 days are required, the first broken day stops. */
export function parseWeeklySchedule(input: unknown): ScheduleResult<Week> {
  if (!isBody(input)) {
    return fail('body must be a JSON object');
  }
  const { weekly } = input;
  if (weekly === undefined) {
    return fail('weekly is required');
  }
  if (!isBody(weekly)) {
    return fail('weekly must be an object keyed by day of week (0-6)');
  }
  const result = {} as Week;
  for (const day of DAYS) {
    if (weekly[day] === undefined) {
      return fail(`day ${day} is required`);
    }
    const parsed = parseDay(weekly[day], day);
    if (!parsed.ok) return parsed;
    result[day] = parsed.value;
  }
  return ok(result);
}

/**
 * Optional `startIntervalMinutes`: `undefined` when absent (keep the stored
 * value), otherwise an integer multiple of 30 in [30, 480].
 */
export function parseStartInterval(
  input: unknown,
): ScheduleResult<number | undefined> {
  if (!isBody(input)) {
    return fail('body must be a JSON object');
  }
  const value = input.startIntervalMinutes;
  if (value === undefined) {
    return ok(undefined);
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 30 ||
    value > 480 ||
    value % 30 !== 0
  ) {
    return fail(SCHEDULE_MESSAGES.invalidStartInterval);
  }
  return ok(value);
}

/** What a schedule request carries. */
export interface ScheduleInput {
  weekly: Week;
  startIntervalMinutes: number | undefined;
}

/** The week first, then the interval: the order the API has always reported them in. */
export function validateScheduleInput(
  input: unknown,
): ScheduleResult<ScheduleInput> {
  const weekly = parseWeeklySchedule(input);
  if (!weekly.ok) return weekly;
  const startIntervalMinutes = parseStartInterval(input);
  if (!startIntervalMinutes.ok) return startIntervalMinutes;
  return ok({
    weekly: weekly.value,
    startIntervalMinutes: startIntervalMinutes.value,
  });
}
