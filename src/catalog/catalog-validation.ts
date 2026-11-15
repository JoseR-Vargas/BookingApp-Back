import { BadRequestException } from '@nestjs/common';
import { DayOfWeek, DaySchedule } from './catalog.config';

/**
 * Manual payload validation for the admin catalog endpoints (the project does
 * not use class-validator). Every parser returns a normalised value and throws
 * a BadRequestException with a clear message. Fields that are not editable
 * (id, rating, avatar, icon, ...) are ignored.
 */

type Body = Record<string, unknown>;

export interface ProfessionalInput {
  name: string;
  specialty: string;
  experience: string;
  active: boolean;
}

export interface ServiceInput {
  name: string;
  description: string;
  price: number;
  duration: number;
  professionals: string[];
  active: boolean;
}

interface FieldSpec<T> {
  parse: (value: unknown, field: string) => T;
  /** Absent = the field is required on create. */
  defaultValue?: T;
}

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

const text =
  (min: number, max: number) =>
  (value: unknown, field: string): string => {
    if (typeof value !== 'string') {
      return fail(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
      return fail(
        min > 0
          ? `${field} must be between ${min} and ${max} characters`
          : `${field} must be at most ${max} characters`,
      );
    }
    return trimmed;
  };

const bool = (value: unknown, field: string): boolean =>
  typeof value === 'boolean' ? value : fail(`${field} must be a boolean`);

const integerBetween =
  (min: number, max: number, message: string) =>
  (value: unknown): number =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
      ? value
      : fail(message);

const professionalIds = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return fail(`${field} must be a non-empty array of professional ids`);
  }
  const ids = value.map((id) =>
    typeof id === 'string' && id.trim() !== ''
      ? id.trim()
      : fail(`${field} must contain only ids (non-empty strings)`),
  );
  return [...new Set(ids)];
};

const PROFESSIONAL_FIELDS: {
  [K in keyof ProfessionalInput]: FieldSpec<ProfessionalInput[K]>;
} = {
  name: { parse: text(1, 80) },
  specialty: { parse: text(0, 80), defaultValue: '' },
  experience: { parse: text(0, 40), defaultValue: '' },
  active: { parse: bool, defaultValue: true },
};

const SERVICE_FIELDS: {
  [K in keyof ServiceInput]: FieldSpec<ServiceInput[K]>;
} = {
  name: { parse: text(1, 80) },
  description: { parse: text(0, 300), defaultValue: '' },
  price: {
    parse: integerBetween(
      0,
      Number.MAX_SAFE_INTEGER,
      'price must be an integer >= 0',
    ),
  },
  duration: {
    parse: integerBetween(
      5,
      480,
      'duration must be an integer between 5 and 480',
    ),
  },
  professionals: { parse: professionalIds },
  active: { parse: bool, defaultValue: true },
};

function asBody(body: unknown): Body {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return fail('body must be a JSON object');
  }
  return body as Body;
}

/**
 * `create`: required fields must be present and missing optional ones get
 * their default. `update`: only the provided fields are returned, at least
 * one is required.
 */
function parseFields<T extends object>(
  input: unknown,
  specs: { [K in keyof T]: FieldSpec<T[K]> },
  mode: 'create' | 'update',
): Partial<T> {
  const body = asBody(input);
  const result: Partial<T> = {};
  for (const field of Object.keys(specs) as (keyof T & string)[]) {
    const spec = specs[field];
    if (body[field] !== undefined) {
      result[field] = spec.parse(body[field], field);
    } else if (mode === 'create') {
      if (spec.defaultValue === undefined) {
        fail(`${field} is required`);
      }
      result[field] = spec.defaultValue;
    }
  }
  if (Object.keys(result).length === 0) {
    fail(
      `body must include at least one editable field (${Object.keys(specs).join(', ')})`,
    );
  }
  return result;
}

export const parseProfessionalCreate = (body: unknown): ProfessionalInput =>
  parseFields(body, PROFESSIONAL_FIELDS, 'create') as ProfessionalInput;

export const parseProfessionalUpdate = (
  body: unknown,
): Partial<ProfessionalInput> =>
  parseFields(body, PROFESSIONAL_FIELDS, 'update');

export const parseServiceCreate = (body: unknown): ServiceInput =>
  parseFields(body, SERVICE_FIELDS, 'create') as ServiceInput;

export const parseServiceUpdate = (body: unknown): Partial<ServiceInput> =>
  parseFields(body, SERVICE_FIELDS, 'update');

/** Id of a new item: lowercase, diacritics stripped, dash-separated. */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** 'HH:mm' on the 30-minute grid, from 00:00 to 23:30. */
const GRID_TIME = /^([01]\d|2[0-3]):(00|30)$/;

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

function parseDay(value: unknown, day: DayOfWeek): DaySchedule {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`day ${day} must be an object`);
  }
  const { closed, open, close } = value as Body;
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
  return { closed: false, open: open as string, close: close as string };
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
