import { DomainError } from '../../shared/domain/domain-error';
import { Err, Result } from '../../shared/domain/result';
import { ServiceSelectionFailedError } from './catalog.errors';
import { Professional } from './professional';
import { Service } from './service';
import {
  buildServiceSelection,
  checkServiceIds,
  pickServices,
} from './service-selection.rules';

const svc = (
  id: string,
  price: number,
  duration: number,
  pros: string[],
): Service => ({
  id,
  name: id,
  description: '',
  price,
  duration,
  professionals: pros,
  icon: 'i',
  active: true,
});

const pro = (
  id: string,
  locationIds: string[] | null = null,
): Professional => ({
  id,
  name: id,
  specialty: '',
  experience: '',
  rating: 5,
  avatar: 'a',
  active: true,
  photo: null,
  locationIds,
});

const failureOf = (result: Result<unknown>): ServiceSelectionFailedError => {
  expect(result.ok).toBe(false);
  const { error } = result as Err<DomainError>;
  expect(error).toBeInstanceOf(ServiceSelectionFailedError);
  return error as ServiceSelectionFailedError;
};

describe('checkServiceIds', () => {
  it('passes a list of distinct ids', () => {
    expect(checkServiceIds(['a', 'b'])).toEqual({
      ok: true,
      value: ['a', 'b'],
    });
  });

  it('rejects an empty list', () => {
    const error = failureOf(checkServiceIds([]));
    expect(error.failure).toBe('empty');
    expect(error.serviceId).toBeUndefined();
    expect(error.message).toBe('debes seleccionar al menos un servicio');
  });

  it('rejects a repeated id, naming the first repeated one', () => {
    const error = failureOf(checkServiceIds(['a', 'b', 'a', 'b']));
    expect(error.failure).toBe('duplicate');
    expect(error.serviceId).toBe('a');
    expect(error.message).toBe('el servicio a está repetido');
  });
});

describe('pickServices', () => {
  it('answers the services in the order the ids were given', () => {
    const found = [svc('b', 1, 1, []), svc('a', 2, 2, [])];
    const picked = pickServices(['a', 'b'], found);
    expect(picked.ok && picked.value.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('rejects the first id without a service', () => {
    const error = failureOf(
      pickServices(['a', 'x', 'y'], [svc('a', 1, 1, [])]),
    );
    expect(error.failure).toBe('unknown');
    expect(error.serviceId).toBe('x');
    expect(error.message).toBe('el servicio x no existe');
  });
});

describe('buildServiceSelection', () => {
  const services = [
    svc('s1', 100, 30, ['ana', 'luis']),
    svc('s2', 50, 20, ['ana']),
  ];
  const professionals = [pro('ana'), pro('luis'), pro('zoe')];

  it('offers the professionals that perform every service and adds the totals', () => {
    const selection = buildServiceSelection(services, professionals);
    expect(selection.professionals.map((p) => p.id)).toEqual(['ana']);
    expect(selection.services).toBe(services);
    expect(selection.totalPrice).toBe(150);
    expect(selection.totalDuration).toBe(50);
  });

  it('keeps the order of the professionals it is given', () => {
    const selection = buildServiceSelection(
      [svc('s', 1, 1, ['zoe', 'ana'])],
      [pro('ana'), pro('zoe')],
    );
    expect(selection.professionals.map((p) => p.id)).toEqual(['ana', 'zoe']);
  });

  it('with a location keeps those that work there; a professional without stored locations works at the default one', () => {
    const list = [
      pro('ana', ['norte']),
      pro('luis', null),
      pro('zoe', ['norte']),
    ];
    const all = [svc('s', 1, 1, ['ana', 'luis', 'zoe'])];
    expect(
      buildServiceSelection(all, list, {
        locationId: 'norte',
        defaultLocationId: 'centro',
      }).professionals.map((p) => p.id),
    ).toEqual(['ana', 'zoe']);
    expect(
      buildServiceSelection(all, list, {
        locationId: 'centro',
        defaultLocationId: 'centro',
      }).professionals.map((p) => p.id),
    ).toEqual(['luis']);
  });
});
