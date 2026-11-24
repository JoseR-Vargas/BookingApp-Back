import { Result, err, ok } from '../../shared/domain/result';
import {
  InvalidCatalogDataError,
  InvalidProfessionalLocationsError,
} from './catalog.errors';
import { FieldSpec, asBody, bool, parseFields, text } from './field.rules';
import {
  NewProfessional,
  ProfessionalPatch,
  StoredPhoto,
} from './professional';

export const DEFAULT_RATING = 5;
export const DEFAULT_AVATAR = 'fas fa-user';

/** What an admin may set when creating a professional. */
export interface ProfessionalInput {
  name: string;
  specialty: string;
  experience: string;
  active: boolean;
  /** Location ids; absent = decided by the use case (create: the default location). */
  locations?: string[];
}

/** A broken field rule, or a malformed list of locations. */
export type ProfessionalInputError =
  | InvalidCatalogDataError
  | InvalidProfessionalLocationsError;

type TextFields = Omit<ProfessionalInput, 'locations'>;

const PROFESSIONAL_FIELDS: {
  [K in keyof TextFields]: FieldSpec<TextFields[K]>;
} = {
  name: { parse: text(1, 80) },
  specialty: { parse: text(0, 80), defaultValue: '' },
  experience: { parse: text(0, 40), defaultValue: '' },
  active: { parse: bool, defaultValue: true },
};

/**
 * Optional `locations` of the body: `undefined` when absent, otherwise a
 * non-empty list of distinct ids. Whether they exist and are active is
 * `ensureActiveLocations`.
 */
function parseLocations(
  body: unknown,
): Result<string[] | undefined, InvalidProfessionalLocationsError> {
  const parsed = asBody(body);
  const locations = parsed.ok ? parsed.value.locations : undefined;
  if (locations === undefined) {
    return ok(undefined);
  }
  if (
    !Array.isArray(locations) ||
    locations.length === 0 ||
    locations.some((id) => typeof id !== 'string' || id.trim() === '') ||
    new Set(locations.map((id: string) => id.trim())).size !== locations.length
  ) {
    return err(new InvalidProfessionalLocationsError());
  }
  return ok((locations as string[]).map((id) => id.trim()));
}

/** Validates the body of "create professional": the fields first, then the locations. */
export function validateProfessionalCreate(
  body: unknown,
): Result<ProfessionalInput, ProfessionalInputError> {
  const fields = parseFields(body, PROFESSIONAL_FIELDS, 'create');
  if (!fields.ok) return fields;
  const locations = parseLocations(body);
  if (!locations.ok) return locations;
  const input = fields.value as ProfessionalInput;
  return ok(locations.value ? { ...input, locations: locations.value } : input);
}

/** Validates the body of "edit professional": the locations first, then the fields. */
export function validateProfessionalUpdate(
  body: unknown,
): Result<Partial<ProfessionalInput>, ProfessionalInputError> {
  const locations = parseLocations(body);
  if (!locations.ok) return locations;
  const patch = parseFields(
    body,
    PROFESSIONAL_FIELDS,
    'update',
    locations.value !== undefined,
  );
  if (!patch.ok) return patch;
  return ok(
    locations.value
      ? { ...patch.value, locations: locations.value }
      : patch.value,
  );
}

/** Every id must be one of the active locations. */
export function ensureActiveLocations(
  ids: string[],
  activeIds: readonly string[],
): Result<string[], InvalidProfessionalLocationsError> {
  const active = new Set(activeIds);
  return ids.every((id) => active.has(id))
    ? ok(ids)
    : err(new InvalidProfessionalLocationsError());
}

/** A professional stored without locations works at the default location. */
export const locationIdsOf = (
  professional: { locationIds: string[] | null },
  defaultLocationId: string,
): string[] => professional.locationIds ?? [defaultLocationId];

/** The document of a new professional: the input plus the defaults. */
export function newProfessional(
  input: Omit<ProfessionalInput, 'locations'>,
  locationIds: string[],
  photo: StoredPhoto | null,
): NewProfessional {
  return {
    name: input.name,
    specialty: input.specialty,
    experience: input.experience,
    active: input.active,
    rating: DEFAULT_RATING,
    avatar: DEFAULT_AVATAR,
    locationIds,
    photo,
  };
}

/** The editable fields of a validated update, once its locations are checked. */
export function toProfessionalPatch(
  input: Partial<ProfessionalInput>,
  locationIds?: string[],
): ProfessionalPatch {
  const fields = { ...input };
  delete fields.locations;
  return locationIds ? { ...fields, locationIds } : fields;
}
