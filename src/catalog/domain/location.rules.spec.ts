import { DomainError } from '../../shared/domain/domain-error';
import { Result } from '../../shared/domain/result';
import { SEED_SCHEDULE as SCHEDULE } from './seed-schedule';
import { Location } from './location';
import {
  InvalidLocationData,
  LastActiveLocation,
  LocationNotFound,
} from './location.errors';
import {
  PRINCIPAL_LOCATION,
  activeLocationIds,
  activeLocations,
  defaultLocation,
  ensureCanChange,
  newLocation,
  principalLocation,
  scheduleOf,
  toWeeklySchedule,
  validateLocationCreate,
  validateLocationUpdate,
} from './location.rules';

const at = (n: number) => new Date(1_700_000_000_000 + n * 1000);

const location = (id: string, extra: Partial<Location> = {}): Location => ({
  id,
  name: id,
  address: '',
  active: true,
  weekly: SCHEDULE.weekly,
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
  createdAt: at(1),
  ...extra,
});

const NAME = 'El nombre del local es obligatorio (máximo 80 caracteres).';
const ADDRESS = 'La dirección del local no puede superar los 200 caracteres.';
const ACTIVE = 'El estado del local debe ser verdadero o falso.';
const LAST_ACTIVE = 'Debe quedar al menos un local activo.';

const rejects = (result: Result<unknown>, message: string) => {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBeInstanceOf(InvalidLocationData);
  expect(result.error).toBeInstanceOf(DomainError);
  expect(result.error.kind).toBe('validation');
  expect(result.error.message).toBe(message);
};

describe('location errors', () => {
  it('LocationNotFound is a not-found with the message of today', () => {
    const error = new LocationNotFound('nope');
    expect(error.kind).toBe('not-found');
    expect(error.message).toBe('Location "nope" not found');
    expect(error.locationId).toBe('nope');
  });

  it('LastActiveLocation keeps the message and the 400 of today', () => {
    const error = new LastActiveLocation();
    expect(error.kind).toBe('validation');
    expect(error.message).toBe(LAST_ACTIVE);
  });
});

describe('activeLocations / defaultLocation', () => {
  it('lists the active locations oldest first, and the oldest is the default', () => {
    const all = [
      location('norte', { createdAt: at(2) }),
      location('centro', { createdAt: at(1) }),
      location('sur', { createdAt: at(3) }),
    ];
    expect(activeLocations(all).map((l) => l.id)).toEqual([
      'centro',
      'norte',
      'sur',
    ]);
    expect(activeLocationIds(all)).toEqual(['centro', 'norte', 'sur']);
    expect(defaultLocation(all)?.id).toBe('centro');
  });

  it('skips the inactive ones, the oldest included', () => {
    const all = [
      location('centro', { active: false, createdAt: at(1) }),
      location('norte', { createdAt: at(2) }),
    ];
    expect(activeLocationIds(all)).toEqual(['norte']);
    expect(defaultLocation(all)?.id).toBe('norte');
  });

  it('breaks a tie of creation time by the order of the list', () => {
    const all = [location('a'), location('b')];
    expect(activeLocationIds(all)).toEqual(['a', 'b']);
    expect(defaultLocation(all)?.id).toBe('a');
  });

  it('has no default when none is active', () => {
    const all = [location('centro', { active: false })];
    expect(activeLocations(all)).toEqual([]);
    expect(defaultLocation(all)).toBeNull();
  });

  it('does not reorder the list it is given', () => {
    const all = [location('b', { createdAt: at(2) }), location('a')];
    activeLocations(all);
    expect(all.map((l) => l.id)).toEqual(['b', 'a']);
  });
});

describe('schedule of a location', () => {
  it('reads the weekly schedule with its two intervals', () => {
    expect(scheduleOf(location('a', { startIntervalMinutes: 60 }))).toEqual({
      weekly: SCHEDULE.weekly,
      slotIntervalMinutes: 30,
      startIntervalMinutes: 60,
    });
  });

  it('a record stored before the start interval existed reads as 30', () => {
    expect(
      toWeeklySchedule({
        weekly: SCHEDULE.weekly,
        slotIntervalMinutes: 30,
      }).startIntervalMinutes,
    ).toBe(30);
  });
});

describe('principalLocation', () => {
  it('copies the given schedule into the active "Principal"', () => {
    const copied = {
      weekly: { ...SCHEDULE.weekly, 1: { closed: true as const } },
      slotIntervalMinutes: 30,
      startIntervalMinutes: 90,
    };
    expect(principalLocation(copied, at(5))).toEqual({
      id: 'principal',
      name: 'Principal',
      address: '',
      active: true,
      ...copied,
      createdAt: at(5),
    });
    expect(PRINCIPAL_LOCATION).toEqual({
      id: 'principal',
      name: 'Principal',
      address: '',
    });
  });
});

describe('validateLocationCreate', () => {
  it('requires a name and defaults the address to an empty string', () => {
    expect(validateLocationCreate({ name: 'Centro' })).toEqual({
      ok: true,
      value: { name: 'Centro', address: '' },
    });
  });

  it('trims the name and the address', () => {
    expect(
      validateLocationCreate({ name: '  Sur ', address: ' Av. 1 ' }),
    ).toEqual({ ok: true, value: { name: 'Sur', address: 'Av. 1' } });
  });

  it.each([undefined, '', '   ', 5, null, 'x'.repeat(81)])(
    'rejects the name %p',
    (name) => {
      rejects(validateLocationCreate({ name }), NAME);
    },
  );

  it('accepts a name of 80 and an address of 200 characters', () => {
    expect(
      validateLocationCreate({
        name: 'x'.repeat(80),
        address: 'y'.repeat(200),
      }).ok,
    ).toBe(true);
  });

  it.each([5, null, 'x'.repeat(201)])('rejects the address %p', (address) => {
    rejects(validateLocationCreate({ name: 'Centro', address }), ADDRESS);
  });

  it('checks the name before the address', () => {
    rejects(validateLocationCreate({ address: 5 }), NAME);
  });

  it.each([null, [], 'str', 5])('rejects the body %p', (body) => {
    rejects(validateLocationCreate(body), 'body must be a JSON object');
  });
});

describe('validateLocationUpdate', () => {
  it('keeps only the provided fields', () => {
    expect(validateLocationUpdate({ name: ' Nuevo ', foo: 1 })).toEqual({
      ok: true,
      value: { name: 'Nuevo' },
    });
    expect(validateLocationUpdate({ address: '', active: false })).toEqual({
      ok: true,
      value: { address: '', active: false },
    });
  });

  it('rejects a body with no editable field', () => {
    rejects(
      validateLocationUpdate({}),
      'body must include at least one editable field (name, address, active)',
    );
    rejects(
      validateLocationUpdate({ foo: 1 }),
      'body must include at least one editable field (name, address, active)',
    );
  });

  it('rejects broken fields in the order name, address, active', () => {
    rejects(validateLocationUpdate({ name: '', address: 5, active: 1 }), NAME);
    rejects(validateLocationUpdate({ address: 5, active: 1 }), ADDRESS);
    rejects(validateLocationUpdate({ active: 'no' }), ACTIVE);
  });

  it.each([null, [], 'str'])('rejects the body %p', (body) => {
    rejects(validateLocationUpdate(body), 'body must be a JSON object');
  });
});

describe('newLocation', () => {
  it('is active, with the seed schedule and the given creation time', () => {
    expect(newLocation({ name: 'Centro', address: 'Av. 1' }, at(7))).toEqual({
      name: 'Centro',
      address: 'Av. 1',
      active: true,
      weekly: SCHEDULE.weekly,
      slotIntervalMinutes: 30,
      startIntervalMinutes: 30,
      createdAt: at(7),
    });
  });
});

describe('ensureCanChange (the last active location)', () => {
  const only = [location('principal')];

  it('refuses to deactivate the last active location', () => {
    const result = ensureCanChange(only, only[0], { active: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(LastActiveLocation);
  });

  it('allows it while another stays active', () => {
    const all = [location('a'), location('b')];
    expect(ensureCanChange(all, all[0], { active: false }).ok).toBe(true);
  });

  it('counts an inactive other as not active', () => {
    const all = [location('a'), location('b', { active: false })];
    expect(ensureCanChange(all, all[0], { active: false }).ok).toBe(false);
  });

  it.each([{ active: true }, { name: 'X' }, {}])(
    'allows %j on the last active location',
    (patch) => {
      expect(ensureCanChange(only, only[0], patch).ok).toBe(true);
    },
  );

  it('allows deactivating an inactive location', () => {
    const all = [location('a'), location('b', { active: false })];
    expect(ensureCanChange(all, all[1], { active: false }).ok).toBe(true);
  });
});
