import { Result, err, ok } from '../../shared/domain/result';
import { InvalidCatalogDataError } from './catalog.errors';
import {
  FieldResult,
  FieldSpec,
  bool,
  integerBetween,
  fail,
  parseFields,
  text,
} from './field.rules';
import { NewService } from './service';

export const DEFAULT_ICON = 'fas fa-star';

/** What an admin may set when creating a service. */
export interface ServiceInput {
  name: string;
  description: string;
  price: number;
  duration: number;
  professionals: string[];
  active: boolean;
}

const professionalIds = (
  value: unknown,
  field: string,
): FieldResult<string[]> => {
  if (!Array.isArray(value) || value.length === 0) {
    return fail(`${field} must be a non-empty array of professional ids`);
  }
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || id.trim() === '') {
      return fail(`${field} must contain only ids (non-empty strings)`);
    }
    ids.push(id.trim());
  }
  return ok([...new Set(ids)]);
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

export const validateServiceCreate = (
  body: unknown,
): FieldResult<ServiceInput> => {
  const parsed = parseFields(body, SERVICE_FIELDS, 'create');
  return parsed.ok ? ok(parsed.value as ServiceInput) : parsed;
};

export const validateServiceUpdate = (
  body: unknown,
): FieldResult<Partial<ServiceInput>> =>
  parseFields(body, SERVICE_FIELDS, 'update');

/** Every professional a service names must exist (active or not). */
export function ensureProfessionalsExist(
  ids: string[],
  knownIds: readonly string[],
): Result<string[], InvalidCatalogDataError> {
  const known = new Set(knownIds);
  const missing = ids.filter((id) => !known.has(id));
  return missing.length > 0
    ? err(
        new InvalidCatalogDataError(
          `professionals not found: ${missing.join(', ')}`,
        ),
      )
    : ok(ids);
}

/** The document of a new service: the input plus the default icon. */
export const newService = (input: ServiceInput): NewService => ({
  ...input,
  icon: DEFAULT_ICON,
});
