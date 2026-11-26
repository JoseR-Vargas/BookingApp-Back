import { DomainError } from '../../shared/domain/domain-error';
import {
  InvalidDate,
  InvalidServiceIds,
  LocationNotFound,
  PublishedServiceNotFound,
  ServiceSelectionFailed,
} from './availability.errors';

describe('availability errors', () => {
  it('InvalidDate is a validation error with the message the API always sent', () => {
    const error = new InvalidDate();
    expect(error).toBeInstanceOf(DomainError);
    expect(error.kind).toBe('validation');
    expect(error.message).toBe('date must be a valid YYYY-MM-DD date');
  });

  it.each([
    ['missing', 'serviceIds is required'],
    ['malformed', 'serviceIds must be a comma-separated list of service ids'],
  ] as const)('InvalidServiceIds (%s)', (reason, message) => {
    const error = new InvalidServiceIds(reason);
    expect(error.kind).toBe('validation');
    expect(error.message).toBe(message);
  });

  it('LocationNotFound is a not-found error that names the id', () => {
    const error = new LocationNotFound('nope');
    expect(error.kind).toBe('not-found');
    expect(error.message).toBe('Location "nope" not found');
    expect(error.locationId).toBe('nope');
  });

  it('PublishedServiceNotFound is a not-found error that names the id', () => {
    const error = new PublishedServiceNotFound('nope');
    expect(error.kind).toBe('not-found');
    expect(error.message).toBe('Service "nope" not found');
  });

  it.each([
    [
      'empty',
      undefined,
      'validation',
      'debes seleccionar al menos un servicio',
    ],
    ['duplicate', 'a', 'validation', 'el servicio a está repetido'],
    ['unknown', 'a', 'not-found', 'Service "a" not found'],
  ] as const)(
    'ServiceSelectionFailed (%s) keeps the failure and the id',
    (failure, serviceId, kind, message) => {
      const error = new ServiceSelectionFailed(failure, serviceId);
      expect(error.kind).toBe(kind);
      expect(error.message).toBe(message);
      expect(error.failure).toBe(failure);
      expect(error.serviceId).toBe(serviceId);
    },
  );
});
