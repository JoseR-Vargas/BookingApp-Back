import { DomainError } from '../../shared/domain/domain-error';
import { Result } from '../../shared/domain/result';
import {
  InvalidPublicAvailability,
  UnknownPublishedService,
} from './location.errors';
import { DEFAULT_PUBLIC_AVAILABILITY } from './public-availability';
import {
  ensurePublishedServicesExist,
  validatePublicAvailability,
} from './public-availability.rules';

const rejects = (result: Result<unknown>, message: string) => {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBeInstanceOf(InvalidPublicAvailability);
  expect(result.error.kind).toBe('validation');
  expect(result.error.message).toBe(message);
};

describe('validatePublicAvailability', () => {
  const BOOL = 'El estado de la página pública debe ser verdadero o falso.';
  const DAYS = 'La cantidad de días debe ser un entero entre 1 y 14.';
  const SERVICES =
    'Los servicios publicados deben ser null (todos) o una lista sin repetidos con al menos un servicio.';

  it('accepts enabled, days and serviceIds (null = all)', () => {
    expect(
      validatePublicAvailability({ enabled: true, days: 7, serviceIds: null }),
    ).toEqual({
      ok: true,
      value: { enabled: true, days: 7, serviceIds: null },
    });
    expect(
      validatePublicAvailability({
        enabled: false,
        days: 14,
        serviceIds: ['a', 'b'],
      }),
    ).toEqual({
      ok: true,
      value: { enabled: false, days: 14, serviceIds: ['a', 'b'] },
    });
  });

  it.each([undefined, 'true', 1, null])('rejects enabled %p', (enabled) => {
    rejects(
      validatePublicAvailability({ enabled, days: 7, serviceIds: null }),
      BOOL,
    );
  });

  it.each([undefined, 0, 15, 1.5, '7', null, -1])('rejects days %p', (days) => {
    rejects(
      validatePublicAvailability({ enabled: true, days, serviceIds: null }),
      DAYS,
    );
  });

  it.each([undefined, [], 'a', ['a', 'a'], [1], [''], ['  ']])(
    'rejects serviceIds %p',
    (serviceIds) => {
      rejects(
        validatePublicAvailability({ enabled: true, days: 7, serviceIds }),
        SERVICES,
      );
    },
  );

  it('checks enabled, then days, then serviceIds', () => {
    rejects(
      validatePublicAvailability({ enabled: 'x', days: 0, serviceIds: 'x' }),
      BOOL,
    );
    rejects(
      validatePublicAvailability({ enabled: true, days: 0, serviceIds: 'x' }),
      DAYS,
    );
  });

  it('rejects a body that is not an object', () => {
    rejects(validatePublicAvailability(null), 'body must be a JSON object');
    rejects(validatePublicAvailability([]), 'body must be a JSON object');
  });
});

describe('ensurePublishedServicesExist', () => {
  const settings = (serviceIds: string[] | null) => ({
    enabled: true,
    days: 7,
    serviceIds,
  });

  it('accepts null (all services) whatever exists', () => {
    expect(ensurePublishedServicesExist(settings(null), [])).toEqual({
      ok: true,
      value: settings(null),
    });
  });

  it('accepts a list of existing services', () => {
    const published = settings(['a', 'b']);
    expect(ensurePublishedServicesExist(published, ['b', 'a', 'c'])).toEqual({
      ok: true,
      value: published,
    });
  });

  it('rejects a service that does not exist, with the message of today', () => {
    const result = ensurePublishedServicesExist(settings(['a', 'nope']), ['a']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(UnknownPublishedService);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.kind).toBe('validation');
    expect(result.error.message).toBe(
      'Alguno de los servicios publicados no existe.',
    );
  });
});

describe('DEFAULT_PUBLIC_AVAILABILITY', () => {
  it('is off, for a week, with every service', () => {
    expect(DEFAULT_PUBLIC_AVAILABILITY).toEqual({
      enabled: false,
      days: 7,
      serviceIds: null,
    });
  });
});
