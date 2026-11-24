import { BadRequestException } from '@nestjs/common';
import {
  DayOfWeek,
  DaySchedule,
  PublicAvailabilitySettings,
} from './catalog.config';

/**
 * Manual payload validation for the schedule, public availability and location
 * endpoints (the project does not use class-validator). Every parser returns a
 * normalised value and throws a BadRequestException with a clear message.
 * Locations migrate in spec 12; the professional and service rules live in
 * `domain/` (spec 11).
 */

type Body = Record<string, unknown>;

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

function asBody(body: unknown): Body {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return fail('body must be a JSON object');
  }
  return body as Body;
}

/** 'HH:mm' on the 30-minute grid, from 00:00 to 23:30. */
const GRID_TIME = /^([01]\d|2[0-3]):(00|30)$/;
/** Any 'HH:mm' time; the grid check is a separate (range) error. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

const STARTS_MESSAGES = {
  list: 'Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.',
  range:
    'Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.',
} as const;

/** Optional per-day `starts`: undefined/null = none; otherwise sorted, validated. */
function parseStarts(
  starts: unknown,
  open: string,
  close: string,
): string[] | undefined {
  if (starts === undefined || starts === null) {
    return undefined;
  }
  if (
    !Array.isArray(starts) ||
    starts.length === 0 ||
    starts.some((time) => typeof time !== 'string' || !HH_MM.test(time)) ||
    new Set(starts).size !== starts.length
  ) {
    return fail(STARTS_MESSAGES.list);
  }
  const times = starts as string[];
  if (
    times.some((time) => !GRID_TIME.test(time) || time < open || time >= close)
  ) {
    return fail(STARTS_MESSAGES.range);
  }
  return [...times].sort();
}

function parseDay(value: unknown, day: DayOfWeek): DaySchedule {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`day ${day} must be an object`);
  }
  const { closed, open, close, starts } = value as Body;
  if (typeof closed !== 'boolean') {
    return fail(`day ${day}: closed must be a boolean`);
  }
  if (closed) {
    return { closed: true };
  }
  for (const [field, time] of [
    ['open', open],
    ['close', close],
  ] as const) {
    if (typeof time !== 'string' || !GRID_TIME.test(time)) {
      fail(
        `day ${day}: ${field} must be an HH:mm time on a 30-minute step between 00:00 and 23:30`,
      );
    }
  }
  // Same-width HH:mm strings compare chronologically.
  if ((open as string) >= (close as string)) {
    fail(`day ${day}: open must be earlier than close`);
  }
  const parsed = parseStarts(starts, open as string, close as string);
  return {
    closed: false,
    open: open as string,
    close: close as string,
    ...(parsed ? { starts: parsed } : {}),
  };
}

/** Validates `{ weekly }` of PUT /admin/schedule; all 7 days are required. */
export function parseWeeklySchedule(
  input: unknown,
): Record<DayOfWeek, DaySchedule> {
  const { weekly } = asBody(input);
  if (weekly === undefined) {
    return fail('weekly is required');
  }
  if (weekly === null || typeof weekly !== 'object' || Array.isArray(weekly)) {
    return fail('weekly must be an object keyed by day of week (0-6)');
  }
  const week = weekly as Body;
  const result = {} as Record<DayOfWeek, DaySchedule>;
  for (const day of DAYS) {
    if (week[day] === undefined) {
      fail(`day ${day} is required`);
    }
    result[day] = parseDay(week[day], day);
  }
  return result;
}

export const SCHEDULE_MESSAGES = {
  invalidStartInterval:
    'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
} as const;

/**
 * Optional `startIntervalMinutes` of PUT /admin/schedule: `undefined` when
 * absent (keep the stored value), otherwise an integer multiple of 30 in
 * [30, 480] or a 400.
 */
export function parseStartInterval(input: unknown): number | undefined {
  const { startIntervalMinutes: value } = asBody(input);
  if (value === undefined) {
    return undefined;
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
  return value;
}

export const PUBLIC_AVAILABILITY_MESSAGES = {
  enabled: 'El estado de la página pública debe ser verdadero o falso.',
  days: 'La cantidad de días debe ser un entero entre 1 y 14.',
  serviceIds:
    'Los servicios publicados deben ser null (todos) o una lista sin repetidos con al menos un servicio.',
} as const;

/** Body of PUT /admin/public-availability: all three fields are required. */
export function parsePublicAvailability(
  input: unknown,
): PublicAvailabilitySettings {
  const { enabled, days, serviceIds } = asBody(input);
  if (typeof enabled !== 'boolean') {
    return fail(PUBLIC_AVAILABILITY_MESSAGES.enabled);
  }
  if (
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 14
  ) {
    return fail(PUBLIC_AVAILABILITY_MESSAGES.days);
  }
  if (serviceIds === null) {
    return { enabled, days, serviceIds: null };
  }
  if (
    !Array.isArray(serviceIds) ||
    serviceIds.length === 0 ||
    serviceIds.some((id) => typeof id !== 'string' || id.trim() === '') ||
    new Set(serviceIds).size !== serviceIds.length
  ) {
    return fail(PUBLIC_AVAILABILITY_MESSAGES.serviceIds);
  }
  return { enabled, days, serviceIds: serviceIds as string[] };
}

export const LOCATION_MESSAGES = {
  name: 'El nombre del local es obligatorio (máximo 80 caracteres).',
  address: 'La dirección del local no puede superar los 200 caracteres.',
  active: 'El estado del local debe ser verdadero o falso.',
  lastActive: 'Debe quedar al menos un local activo.',
} as const;

export interface LocationInput {
  name: string;
  address: string;
}

const locationName = (value: unknown): string => {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length >= 1 && name.length <= 80
    ? name
    : fail(LOCATION_MESSAGES.name);
};

const locationAddress = (value: unknown): string => {
  const address = typeof value === 'string' ? value.trim() : '';
  return typeof value === 'string' && address.length <= 200
    ? address
    : fail(LOCATION_MESSAGES.address);
};

/** Body of POST /admin/locations: `name` is required, `address` defaults to ''. */
export function parseLocationCreate(input: unknown): LocationInput {
  const { name, address } = asBody(input);
  return {
    name: locationName(name),
    address: address === undefined ? '' : locationAddress(address),
  };
}

/** Body of PUT /admin/locations/:id: only the provided fields; at least one. */
export function parseLocationUpdate(
  input: unknown,
): Partial<LocationInput & { active: boolean }> {
  const { name, address, active } = asBody(input);
  const result: Partial<LocationInput & { active: boolean }> = {};
  if (name !== undefined) {
    result.name = locationName(name);
  }
  if (address !== undefined) {
    result.address = locationAddress(address);
  }
  if (active !== undefined) {
    result.active =
      typeof active === 'boolean' ? active : fail(LOCATION_MESSAGES.active);
  }
  if (Object.keys(result).length === 0) {
    fail(
      'body must include at least one editable field (name, address, active)',
    );
  }
  return result;
}
