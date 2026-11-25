import { Result, err, ok } from '../../shared/domain/result';
import { InvalidCatalogDataError } from './catalog.errors';

/**
 * Field-by-field validation of an untrusted body (the project does not use
 * class-validator). Every parser answers the normalised value or the first
 * broken rule; the messages are the ones the API has always sent.
 */

export type Body = Record<string, unknown>;

export type FieldResult<T> = Result<T, InvalidCatalogDataError>;

export interface FieldSpec<T> {
  parse: (value: unknown, field: string) => FieldResult<T>;
  /** Absent = the field is required on create. */
  defaultValue?: T;
}

export const fail = (message: string): FieldResult<never> =>
  err(new InvalidCatalogDataError(message));

export const text =
  (min: number, max: number) =>
  (value: unknown, field: string): FieldResult<string> => {
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
    return ok(trimmed);
  };

export const bool = (value: unknown, field: string): FieldResult<boolean> =>
  typeof value === 'boolean' ? ok(value) : fail(`${field} must be a boolean`);

export const integerBetween =
  (min: number, max: number, message: string) =>
  (value: unknown): FieldResult<number> =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
      ? ok(value)
      : fail(message);

/** A JSON object: not null, not an array. */
export const isBody = (value: unknown): value is Body =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function asBody(body: unknown): FieldResult<Body> {
  if (!isBody(body)) {
    return fail('body must be a JSON object');
  }
  return ok(body);
}

/**
 * `create`: required fields must be present and missing optional ones get
 * their default. `update`: only the provided fields are returned, at least
 * one is required. Fields that are not editable are ignored.
 */
export function parseFields<T extends object>(
  input: unknown,
  specs: { [K in keyof T]: FieldSpec<T[K]> },
  mode: 'create' | 'update',
  /** True when the caller handles other fields, so an empty result is fine. */
  allowEmpty = false,
): FieldResult<Partial<T>> {
  const body = asBody(input);
  if (!body.ok) return body;
  const result: Partial<T> = {};
  for (const field of Object.keys(specs) as (keyof T & string)[]) {
    const spec = specs[field];
    const value = body.value[field];
    if (value !== undefined) {
      const parsed = spec.parse(value, field);
      if (!parsed.ok) return parsed;
      result[field] = parsed.value;
    } else if (mode === 'create') {
      if (spec.defaultValue === undefined) {
        return fail(`${field} is required`);
      }
      result[field] = spec.defaultValue;
    }
  }
  if (!allowEmpty && Object.keys(result).length === 0) {
    return fail(
      `body must include at least one editable field (${Object.keys(specs).join(', ')})`,
    );
  }
  return ok(result);
}
