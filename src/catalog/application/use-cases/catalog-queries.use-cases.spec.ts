import { DomainError } from '../../../shared/domain/domain-error';
import { Err, Ok, Result } from '../../../shared/domain/result';
import {
  NoActiveLocationError,
  ServiceSelectionFailedError,
} from '../../domain/catalog.errors';
import { inMemoryCatalog } from '../../infrastructure/in-memory-catalog.testing';

const valueOf = <T>(result: Result<T, DomainError>): T => {
  expect(result.ok).toBe(true);
  return (result as Ok<T>).value;
};

const failureOf = (result: Result<unknown, DomainError>) => {
  expect(result.ok).toBe(false);
  const { error } = result as Err<DomainError>;
  expect(error).toBeInstanceOf(ServiceSelectionFailedError);
  return error as ServiceSelectionFailedError;
};

function setup() {
  const kit = inMemoryCatalog();
  kit.professionals.seed({ id: 'alex', name: 'Alex' });
  kit.professionals.seed({ id: 'maria', name: 'María' });
  kit.professionals.seed({ id: 'off', name: 'Off', active: false });
  kit.services.seed({
    id: 'basico',
    name: 'Básico',
    price: 1200,
    duration: 60,
    professionals: ['alex', 'maria', 'off'],
  });
  kit.services.seed({
    id: 'premium',
    name: 'Premium',
    price: 3000,
    duration: 90,
    professionals: ['alex', 'off'],
  });
  kit.services.seed({
    id: 'inactivo',
    name: 'Inactivo',
    professionals: ['alex'],
    active: false,
  });
  return kit;
}

describe('ResolveServiceSelectionUseCase', () => {
  it('resolves the services in the given order with accumulated totals', async () => {
    const { useCases } = setup();
    const selection = valueOf(
      await useCases.resolveServiceSelection.execute({
        serviceIds: ['premium', 'basico'],
      }),
    );
    expect(selection.services.map((s) => s.id)).toEqual(['premium', 'basico']);
    expect(selection.totalPrice).toBe(4200);
    expect(selection.totalDuration).toBe(150);
  });

  it('offers the active professionals common to all the services', async () => {
    const { useCases } = setup();
    const both = valueOf(
      await useCases.resolveServiceSelection.execute({
        serviceIds: ['basico', 'premium'],
      }),
    );
    expect(both.professionals.map((p) => p.id)).toEqual(['alex']);
    const one = valueOf(
      await useCases.resolveServiceSelection.execute({
        serviceIds: ['basico'],
      }),
    );
    expect(one.professionals.map((p) => p.id)).toEqual(['alex', 'maria']);
  });

  it('rejects an empty list', async () => {
    const { useCases } = setup();
    const error = failureOf(
      await useCases.resolveServiceSelection.execute({ serviceIds: [] }),
    );
    expect(error.failure).toBe('empty');
    expect(error.serviceId).toBeUndefined();
  });

  it('rejects a duplicated id', async () => {
    const { useCases } = setup();
    const error = failureOf(
      await useCases.resolveServiceSelection.execute({
        serviceIds: ['basico', 'premium', 'basico'],
      }),
    );
    expect(error.failure).toBe('duplicate');
    expect(error.serviceId).toBe('basico');
  });

  it('rejects an unknown id, and treats an inactive service as unknown', async () => {
    const { useCases } = setup();
    const unknown = failureOf(
      await useCases.resolveServiceSelection.execute({
        serviceIds: ['basico', 'nope'],
      }),
    );
    expect([unknown.failure, unknown.serviceId]).toEqual(['unknown', 'nope']);
    const inactive = failureOf(
      await useCases.resolveServiceSelection.execute({
        serviceIds: ['inactivo'],
      }),
    );
    expect([inactive.failure, inactive.serviceId]).toEqual([
      'unknown',
      'inactivo',
    ]);
  });

  it('with a location offers only the professionals working there', async () => {
    const { useCases, professionals, locations } = setup();
    locations.seed({ id: 'centro', active: true, createdAt: new Date(1) });
    await professionals.update('maria', { locationIds: ['norte'] });
    const at = async (locationId: string) =>
      valueOf(
        await useCases.resolveServiceSelection.execute({
          serviceIds: ['basico'],
          locationId,
        }),
      ).professionals.map((p) => p.id);
    expect(await at('norte')).toEqual(['maria']);
    // Alex was stored without locations: he works at the default one.
    expect(await at('centro')).toEqual(['alex']);
    expect(await at('sur')).toEqual([]);
  });

  it('with a location and no active location at all answers a domain error', async () => {
    const { useCases, locations } = setup();
    locations.seed({ id: 'centro', active: false, createdAt: new Date(1) });
    const result = await useCases.resolveServiceSelection.execute({
      serviceIds: ['basico'],
      locationId: 'centro',
    });
    expect((result as Err<DomainError>).error).toBeInstanceOf(
      NoActiveLocationError,
    );
  });
});

describe('GetPublicCatalogUseCase', () => {
  it('lists only the active professionals and services, with the active professionals of each service', async () => {
    const { useCases } = setup();
    const catalog = valueOf(
      await useCases.getPublicCatalog.execute({
        activeLocationIds: ['centro'],
        defaultLocationId: 'centro',
      }),
    );
    expect(catalog.professionals.map((v) => v.professional.id)).toEqual([
      'alex',
      'maria',
    ]);
    expect(catalog.services.map((s) => [s.id, s.professionals])).toEqual([
      ['basico', ['alex', 'maria']],
      ['premium', ['alex']],
    ]);
  });

  it('shows each professional only at its active locations', async () => {
    const { useCases, professionals } = setup();
    await professionals.update('maria', { locationIds: ['norte', 'gone'] });
    const catalog = valueOf(
      await useCases.getPublicCatalog.execute({
        activeLocationIds: ['centro', 'norte'],
        defaultLocationId: 'centro',
      }),
    );
    expect(catalog.professionals.map((v) => v.locationIds)).toEqual([
      ['centro'],
      ['norte'],
    ]);
  });
});
