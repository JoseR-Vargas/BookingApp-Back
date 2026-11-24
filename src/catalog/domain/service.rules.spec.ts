import { DomainError } from '../../shared/domain/domain-error';
import { Err, Result } from '../../shared/domain/result';
import { InvalidCatalogDataError } from './catalog.errors';
import {
  DEFAULT_ICON,
  ensureProfessionalsExist,
  newService,
  validateServiceCreate,
  validateServiceUpdate,
} from './service.rules';

const valueOf = <T>(result: Result<T, DomainError>): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const rejects = (result: Result<unknown>, message: string | RegExp) => {
  expect(result.ok).toBe(false);
  const { error } = result as Err<DomainError>;
  expect(error).toBeInstanceOf(InvalidCatalogDataError);
  expect(error.kind).toBe('validation');
  if (typeof message === 'string') expect(error.message).toBe(message);
  else expect(error.message).toMatch(message);
};

describe('validateServiceCreate', () => {
  const valid = {
    name: 'Corte',
    description: '  Corte clásico ',
    price: 1500,
    duration: 45,
    professionals: ['alex-garcia', 'maria-lopez', 'alex-garcia'],
  };

  it('normalises a valid payload (trim, dedupe professionals, active default)', () => {
    expect(valueOf(validateServiceCreate({ ...valid, icon: 'hack' }))).toEqual({
      name: 'Corte',
      description: 'Corte clásico',
      price: 1500,
      duration: 45,
      professionals: ['alex-garcia', 'maria-lopez'],
      active: true,
    });
  });

  it('defaults description to an empty string', () => {
    const { description: _description, ...rest } = valid;
    expect(valueOf(validateServiceCreate(rest)).description).toBe('');
  });

  it.each([
    [{ ...valid, name: undefined }, 'name is required'],
    [{ ...valid, price: undefined }, 'price is required'],
    [{ ...valid, duration: undefined }, 'duration is required'],
    [{ ...valid, professionals: undefined }, 'professionals is required'],
    [{ ...valid, price: -1 }, 'price must be an integer >= 0'],
    [{ ...valid, price: 10.5 }, 'price must be an integer >= 0'],
    [{ ...valid, price: '100' }, 'price must be an integer >= 0'],
    [{ ...valid, price: Number.NaN }, 'price must be an integer >= 0'],
    [
      { ...valid, duration: 4 },
      'duration must be an integer between 5 and 480',
    ],
    [
      { ...valid, duration: 481 },
      'duration must be an integer between 5 and 480',
    ],
    [
      { ...valid, duration: 30.5 },
      'duration must be an integer between 5 and 480',
    ],
    [
      { ...valid, professionals: [] },
      'professionals must be a non-empty array of professional ids',
    ],
    [
      { ...valid, professionals: 'alex' },
      'professionals must be a non-empty array of professional ids',
    ],
    [
      { ...valid, professionals: [''] },
      'professionals must contain only ids (non-empty strings)',
    ],
    [
      { ...valid, professionals: [1] },
      'professionals must contain only ids (non-empty strings)',
    ],
    [
      { ...valid, description: 'x'.repeat(301) },
      'description must be at most 300 characters',
    ],
    [{ ...valid, active: 1 }, 'active must be a boolean'],
  ])('rejects %j', (body, message) => {
    rejects(validateServiceCreate(body), message);
  });

  it('reports the first broken field in order: name, description, price, duration, professionals, active', () => {
    rejects(
      validateServiceCreate({ ...valid, name: '', price: -1 }),
      'name must be between 1 and 80 characters',
    );
    rejects(
      validateServiceCreate({ ...valid, price: -1, duration: 1 }),
      'price must be an integer >= 0',
    );
  });

  it.each([null, undefined, 'text', []])(
    'rejects a non-object body %j',
    (body) => {
      rejects(validateServiceCreate(body), 'body must be a JSON object');
    },
  );

  it.each([
    [
      { price: 0, duration: 5 },
      { price: 0, duration: 5 },
    ],
    [
      { price: 99999, duration: 480 },
      { price: 99999, duration: 480 },
    ],
  ])('accepts the numeric boundaries %j', (patch, expected) => {
    expect(
      valueOf(validateServiceCreate({ ...valid, ...patch })),
    ).toMatchObject(expected);
  });
});

describe('validateServiceUpdate', () => {
  it('returns only the provided editable fields', () => {
    expect(
      valueOf(
        validateServiceUpdate({ price: 10, active: false, icon: 'x', id: 'y' }),
      ),
    ).toEqual({ price: 10, active: false });
  });

  it('validates the provided fields with the same rules', () => {
    rejects(validateServiceUpdate({ duration: 3 }), /duration must be/);
    rejects(validateServiceUpdate({ price: -5 }), /price must be/);
    rejects(validateServiceUpdate({ professionals: [] }), /non-empty/);
    rejects(
      validateServiceUpdate({}),
      'body must include at least one editable field (name, description, price, duration, professionals, active)',
    );
  });
});

describe('ensureProfessionalsExist', () => {
  it('answers the ids when all are known', () => {
    expect(
      valueOf(ensureProfessionalsExist(['a', 'b'], ['b', 'a', 'c'])),
    ).toEqual(['a', 'b']);
  });

  it('lists the missing ids in the order given', () => {
    rejects(
      ensureProfessionalsExist(
        ['alex-garcia', 'ghost', 'phantom'],
        ['alex-garcia'],
      ),
      'professionals not found: ghost, phantom',
    );
  });
});

describe('newService', () => {
  it('adds the default icon', () => {
    const fields = {
      name: 'Corte',
      description: '',
      price: 1,
      duration: 30,
      professionals: ['a'],
      active: true,
    };
    expect(newService(fields)).toEqual({ ...fields, icon: DEFAULT_ICON });
    expect(DEFAULT_ICON).toBe('fas fa-star');
  });
});
