import { Err, Result } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import {
  InvalidCatalogDataError,
  InvalidProfessionalLocationsError,
} from './catalog.errors';
import {
  DEFAULT_AVATAR,
  DEFAULT_RATING,
  ensureActiveLocations,
  locationIdsOf,
  newProfessional,
  validateProfessionalCreate,
  validateProfessionalUpdate,
} from './professional.rules';

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

const LOCATIONS_MESSAGE =
  'El profesional debe trabajar en al menos un local activo.';

describe('validateProfessionalCreate', () => {
  it('applies defaults and trims strings', () => {
    expect(
      valueOf(validateProfessionalCreate({ name: '  Ana Ruiz  ' })),
    ).toEqual({
      name: 'Ana Ruiz',
      specialty: '',
      experience: '',
      active: true,
    });
  });

  it('accepts all editable fields and ignores unknown ones', () => {
    expect(
      valueOf(
        validateProfessionalCreate({
          id: 'hacked',
          name: 'Ana',
          specialty: 'Colorist',
          experience: '3 años',
          active: false,
          rating: 1,
          avatar: 'x',
        }),
      ),
    ).toEqual({
      name: 'Ana',
      specialty: 'Colorist',
      experience: '3 años',
      active: false,
    });
  });

  it.each([
    [{}, 'name is required'],
    [{ name: '   ' }, 'name must be between 1 and 80 characters'],
    [{ name: 'x'.repeat(81) }, 'name must be between 1 and 80 characters'],
    [{ name: 5 }, 'name must be a string'],
    [
      { name: 'a', specialty: 'x'.repeat(81) },
      'specialty must be at most 80 characters',
    ],
    [{ name: 'a', specialty: 3 }, 'specialty must be a string'],
    [
      { name: 'a', experience: 'x'.repeat(41) },
      'experience must be at most 40 characters',
    ],
    [{ name: 'a', active: 'yes' }, 'active must be a boolean'],
  ])('rejects %j', (body, message) => {
    rejects(validateProfessionalCreate(body), message);
  });

  it('reports the first broken field, in the order name, specialty, experience, active', () => {
    rejects(
      validateProfessionalCreate({
        name: '',
        specialty: 'x'.repeat(81),
        active: 'no',
      }),
      'name must be between 1 and 80 characters',
    );
    rejects(
      validateProfessionalCreate({
        name: 'a',
        experience: 'x'.repeat(41),
        active: 'no',
      }),
      'experience must be at most 40 characters',
    );
  });

  it.each([null, undefined, 'text', 42, [], [{ name: 'a' }]])(
    'rejects a non-object body %j',
    (body) => {
      rejects(validateProfessionalCreate(body), 'body must be a JSON object');
    },
  );

  it('accepts the length boundaries', () => {
    expect(
      valueOf(
        validateProfessionalCreate({
          name: 'x'.repeat(80),
          specialty: 'y'.repeat(80),
          experience: 'z'.repeat(40),
        }),
      ),
    ).toMatchObject({ name: 'x'.repeat(80) });
  });

  describe('locations', () => {
    it('are absent when the body has none', () => {
      expect(
        valueOf(validateProfessionalCreate({ name: 'Ana' })),
      ).not.toHaveProperty('locations');
    });

    it('keeps a trimmed list of distinct ids', () => {
      expect(
        valueOf(
          validateProfessionalCreate({
            name: 'Ana',
            locations: [' centro ', 'norte'],
          }),
        ).locations,
      ).toEqual(['centro', 'norte']);
    });

    it.each([
      [[]],
      ['centro'],
      [['']],
      [[3]],
      [['centro', 'centro']],
      [['centro', ' centro ']],
    ])('rejects %j with the locations message', (locations) => {
      const result = validateProfessionalCreate({ name: 'Ana', locations });
      expect(result.ok).toBe(false);
      const { error } = result as Err<DomainError>;
      expect(error).toBeInstanceOf(InvalidProfessionalLocationsError);
      expect(error.kind).toBe('validation');
      expect(error.message).toBe(LOCATIONS_MESSAGE);
    });

    it('is checked after the other fields', () => {
      rejects(
        validateProfessionalCreate({ name: '', locations: [] }),
        'name must be between 1 and 80 characters',
      );
    });
  });
});

describe('validateProfessionalUpdate', () => {
  it('returns only the provided editable fields', () => {
    expect(
      valueOf(validateProfessionalUpdate({ active: false, rating: 1 })),
    ).toEqual({ active: false });
    expect(valueOf(validateProfessionalUpdate({ name: ' New ' }))).toEqual({
      name: 'New',
    });
  });

  it('allows clearing optional text fields', () => {
    expect(valueOf(validateProfessionalUpdate({ specialty: '' }))).toEqual({
      specialty: '',
    });
  });

  it('rejects an empty name and bodies with no editable field', () => {
    rejects(validateProfessionalUpdate({ name: '' }), /name must be between/);
    rejects(
      validateProfessionalUpdate({}),
      'body must include at least one editable field (name, specialty, experience, active)',
    );
    rejects(
      validateProfessionalUpdate({ id: 'x', rating: 3 }),
      /at least one editable field/,
    );
    rejects(validateProfessionalUpdate([]), 'body must be a JSON object');
  });

  it('accepts a body with only locations', () => {
    expect(
      valueOf(validateProfessionalUpdate({ locations: ['centro'] })),
    ).toEqual({ locations: ['centro'] });
  });

  it('checks the locations before the other fields', () => {
    const result = validateProfessionalUpdate({ name: '', locations: [] });
    expect(result.ok).toBe(false);
    expect((result as Err<DomainError>).error.message).toBe(LOCATIONS_MESSAGE);
  });
});

describe('ensureActiveLocations', () => {
  it('answers the ids when every one is active', () => {
    expect(
      valueOf(ensureActiveLocations(['centro', 'norte'], ['norte', 'centro'])),
    ).toEqual(['centro', 'norte']);
  });

  it('rejects when any id is not active, with the locations message', () => {
    const result = ensureActiveLocations(['centro', 'gone'], ['centro']);
    expect(result.ok).toBe(false);
    const { error } = result as Err<DomainError>;
    expect(error).toBeInstanceOf(InvalidProfessionalLocationsError);
    expect(error.message).toBe(LOCATIONS_MESSAGE);
  });
});

describe('locationIdsOf', () => {
  it('answers the stored ids, or the default location when none were stored', () => {
    expect(locationIdsOf({ locationIds: ['norte'] }, 'centro')).toEqual([
      'norte',
    ]);
    expect(locationIdsOf({ locationIds: null }, 'centro')).toEqual(['centro']);
  });
});

describe('newProfessional', () => {
  it('adds the default rating and avatar, and the given locations and photo', () => {
    const photo = {
      mimeType: 'image/png' as const,
      data: Buffer.from([1]),
      updatedAt: new Date(5),
    };
    expect(
      newProfessional(
        { name: 'Ana', specialty: '', experience: '', active: true },
        ['centro'],
        photo,
      ),
    ).toEqual({
      name: 'Ana',
      specialty: '',
      experience: '',
      active: true,
      rating: DEFAULT_RATING,
      avatar: DEFAULT_AVATAR,
      locationIds: ['centro'],
      photo,
    });
    expect(DEFAULT_RATING).toBe(5);
    expect(DEFAULT_AVATAR).toBe('fas fa-user');
  });
});
